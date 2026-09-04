<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class VerificationController extends Controller
{
    /**
     * POST /api/verification/send
     * Body: { "user_id": "...", "email": "..." }
     * JWT sub must match user_id.
     */
    public function send(Request $request)
    {
        $data = $request->validate([
            'user_id' => 'required|uuid',
            'email' => 'required|email|max:255',
        ]);

        $authUserId = $request->attributes->get('supabase_user_id');
        if ($authUserId !== $data['user_id']) {
            return response()->json(['ok' => false, 'error' => 'Forbidden'], 403);
        }

        // Bind destination to the authenticated account email only (no off-account phishing).
        $sessionEmail = strtolower(trim((string) (
            data_get($request->attributes->get('supabase_jwt'), 'email')
            ?? data_get($request->session()->get('ht_auth'), 'email')
            ?? ''
        )));
        $requestedEmail = strtolower(trim($data['email']));
        if ($sessionEmail === '' || $requestedEmail !== $sessionEmail) {
            return response()->json([
                'ok' => false,
                'error' => 'Verification email must match your account email.',
            ], 422);
        }

        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $dir = storage_path('app/email_verifications');
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }
        file_put_contents(
            $dir.DIRECTORY_SEPARATOR.$data['user_id'].'.json',
            json_encode([
                'code' => $code,
                'expires_at' => now()->addMinutes(10)->toIso8601String(),
            ], JSON_THROW_ON_ERROR),
            LOCK_EX
        );

        try {
            Mail::html(
                '<div style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">'
                .'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">'
                .'<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">'
                .'<tr><td style="background:#0f766e;padding:24px 32px"><p style="margin:0;color:#ccfbf1;font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700">HealthTrack · RHU Pila</p>'
                .'<h1 style="margin:8px 0 0;color:#fff;font-size:22px">Confirm your email</h1></td></tr>'
                .'<tr><td style="padding:28px 32px">'
                .'<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.6">Use this 6-digit code to activate your patient portal account:</p>'
                .'<p style="margin:16px 0;font-size:32px;font-weight:700;letter-spacing:10px;color:#0f172a">'.e($code).'</p>'
                .'<p style="margin:0;color:#64748b;font-size:13px">This code expires in 10 minutes. If you did not register, ignore this email.</p>'
                .'</td></tr>'
                .'<tr><td style="padding:16px 32px 24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px">Rural Health Unit of Pila, Laguna</td></tr>'
                .'</table></td></tr></table></div>',
                function ($message) use ($sessionEmail) {
                    $message
                        ->to($sessionEmail)
                        ->subject('Confirm your HealthTrack email')
                        ->text('Your HealthTrack verification code expires in 10 minutes. Open the patient portal Verify page to enter it.');
                }
            );
        } catch (\Throwable $e) {
            Log::warning('[verify] send failed: '.$e->getMessage());

            return response()->json([
                'ok' => false,
                'error' => 'Failed to send verification email.',
            ], 500);
        }

        return response()->json(['ok' => true]);
    }

    /**
     * POST /api/verification/verify
     */
    public function verify(Request $request)
    {
        $data = $request->validate([
            'user_id' => 'required|uuid',
            'code' => 'required|string|size:6',
        ]);

        $authUserId = $request->attributes->get('supabase_user_id');
        if ($authUserId !== $data['user_id']) {
            return response()->json(['ok' => false, 'error' => 'Forbidden'], 403);
        }

        $path = storage_path('app/email_verifications'.DIRECTORY_SEPARATOR.$data['user_id'].'.json');
        if (!is_file($path)) {
            return response()->json([
                'ok' => false,
                'error' => 'Code expired or not found. Please request a new code.',
            ], 422);
        }

        try {
            $payload = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            @unlink($path);

            return response()->json([
                'ok' => false,
                'error' => 'Code expired or not found. Please request a new code.',
            ], 422);
        }

        $expiresAt = isset($payload['expires_at']) ? strtotime((string) $payload['expires_at']) : false;
        if ($expiresAt === false || $expiresAt < time()) {
            @unlink($path);

            return response()->json([
                'ok' => false,
                'error' => 'Code expired or not found. Please request a new code.',
            ], 422);
        }

        if (!hash_equals((string) ($payload['code'] ?? ''), $data['code'])) {
            return response()->json([
                'ok' => false,
                'error' => 'Invalid code. Please try again.',
            ], 422);
        }

        @unlink($path);

        $supabaseUrl = rtrim((string) config('services.supabase.url'), '/');
        $serviceRoleKey = (string) config('services.supabase.service_role_key');

        if ($supabaseUrl && $serviceRoleKey) {
            try {
                Http::withHeaders([
                    'apikey' => $serviceRoleKey,
                    'Authorization' => 'Bearer '.$serviceRoleKey,
                    'Content-Type' => 'application/json',
                ])->put("{$supabaseUrl}/auth/v1/admin/users/{$data['user_id']}", [
                    'email_confirm' => true,
                    'user_metadata' => [
                        'email_verified' => true,
                        'app' => 'patient',
                    ],
                ]);
            } catch (\Throwable $e) {
                Log::warning('[verify] Failed to update Supabase user metadata: '.$e->getMessage());
            }
        }

        $auth = $request->session()->get('ht_auth');
        if (is_array($auth)) {
            $auth['email_verified'] = true;
            $meta = is_array($auth['user_metadata'] ?? null) ? $auth['user_metadata'] : [];
            $meta['email_verified'] = true;
            $meta['app'] = $meta['app'] ?? 'patient';
            $auth['user_metadata'] = $meta;
            $request->session()->put('ht_auth', $auth);
        }

        return response()->json(['ok' => true]);
    }
}
