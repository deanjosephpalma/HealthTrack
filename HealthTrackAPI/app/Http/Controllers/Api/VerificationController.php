<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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
        Cache::put("verify:{$data['user_id']}", $code, now()->addMinutes(10));

        try {
            Mail::send([], [], function ($message) use ($sessionEmail, $code) {
                $message
                    ->to($sessionEmail)
                    ->subject('Your HealthTrack Verification Code')
                    ->html(
                        '<div style="font-family:Arial,sans-serif;line-height:1.5;color:#1b2a3a">'
                        .'<h2 style="margin:0 0 12px">Verify your HealthTrack account</h2>'
                        .'<p>Use this 6-digit code to activate your patient portal account:</p>'
                        .'<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0">'
                        .e($code)
                        .'</p>'
                        .'<p style="color:#64748b;font-size:14px">This code expires in 10 minutes.</p>'
                        .'<p style="color:#64748b;font-size:14px">If you did not register, you can ignore this email.</p>'
                        .'<p style="color:#64748b;font-size:14px">— Rural Health Unit of Pila</p>'
                        .'</div>'
                    );
            });
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

        $stored = Cache::get("verify:{$data['user_id']}");
        if (!$stored) {
            return response()->json([
                'ok' => false,
                'error' => 'Code expired or not found. Please request a new code.',
            ], 422);
        }

        if (!hash_equals((string) $stored, $data['code'])) {
            return response()->json([
                'ok' => false,
                'error' => 'Invalid code. Please try again.',
            ], 422);
        }

        Cache::forget("verify:{$data['user_id']}");

        $supabaseUrl = rtrim((string) config('services.supabase.url'), '/');
        $serviceRoleKey = (string) config('services.supabase.service_role_key');

        if ($supabaseUrl && $serviceRoleKey) {
            try {
                Http::withHeaders([
                    'apikey' => $serviceRoleKey,
                    'Authorization' => 'Bearer '.$serviceRoleKey,
                    'Content-Type' => 'application/json',
                ])->put("{$supabaseUrl}/auth/v1/admin/users/{$data['user_id']}", [
                    'user_metadata' => ['email_verified' => true],
                ]);
            } catch (\Throwable $e) {
                Log::warning('[verify] Failed to update Supabase user metadata: '.$e->getMessage());
            }
        }

        return response()->json(['ok' => true]);
    }
}
