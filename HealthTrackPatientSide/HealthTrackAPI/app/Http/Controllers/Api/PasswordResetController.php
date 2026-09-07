<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SupabasePasswordAuth;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class PasswordResetController extends Controller
{
    /** How long a reset link stays valid. */
    private const TOKEN_TTL_MINUTES = 60;

    public function __construct(private SupabasePasswordAuth $supabaseAuth)
    {
    }

    /**
     * POST /api/auth/password-reset/request
     * Patient portal only. Body: { email, portal: "patient" }
     */
    public function request(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email|max:255',
            'portal' => 'required|string|in:patient',
        ]);

        $email = strtolower(trim($data['email']));
        $portal = 'patient';
        $notFoundMessage = 'This email is not registered in HealthTrack';

        $user = $this->supabaseAuth->findAuthUserByEmail($email);
        if (!$user || !$this->portalAllowsUser($portal, $user)) {
            return response()->json([
                'ok' => false,
                'error' => $notFoundMessage,
            ], 404);
        }

        try {
            $this->pruneExpiredTokens();

            $token = Str::random(64);
            $tokenHash = hash('sha256', $token);
            $expiresAt = now()->addMinutes(self::TOKEN_TTL_MINUTES)->toIso8601String();

            $this->writeToken($tokenHash, [
                'user_id' => (string) $user['id'],
                'email' => $email,
                'portal' => $portal,
                'expires_at' => $expiresAt,
                'created_at' => now()->toIso8601String(),
            ]);

            $baseUrl = rtrim((string) config('services.apps.patient_url'), '/');
            if ($baseUrl === '') {
                $baseUrl = 'http://localhost:5173';
            }

            $resetUrl = $baseUrl.'/reset-password?'.http_build_query([
                'token' => $token,
                'email' => $email,
            ]);

            $who = 'patient portal';
            $ttl = self::TOKEN_TTL_MINUTES;
            $html = $this->buildResetEmailHtml($who, $resetUrl, $ttl, $email);
            $text = $this->buildResetEmailText($who, $resetUrl, $ttl);

            Mail::html($html, function ($message) use ($email, $text) {
                $message
                    ->to($email)
                    ->subject('Reset your HealthTrack password')
                    ->text($text);
            });
        } catch (\Throwable $e) {
            Log::warning('[password-reset] request failed: '.$e->getMessage());

            return response()->json([
                'ok' => false,
                'error' => 'Could not send the reset email. Please try again in a moment.',
            ], 500);
        }

        return response()->json([
            'ok' => true,
            'message' => 'Password reset link sent. Check your inbox (and spam folder).',
        ]);
    }

    /**
     * POST /api/auth/password-reset/confirm
     * Body: { email, token, password, password_confirmation, portal }
     */
    public function confirm(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email|max:255',
            'token' => 'required|string|min:32|max:128',
            'password' => [
                'required',
                'string',
                'min:6',
                'max:255',
                'confirmed',
                'regex:/[A-Z]/',
                'regex:/[^A-Za-z0-9]/',
            ],
            'portal' => 'required|string|in:patient',
        ], [
            'password.regex' => 'Password must include at least one uppercase letter and one special character.',
        ]);

        $email = strtolower(trim($data['email']));
        $portal = 'patient';
        $tokenHash = hash('sha256', $data['token']);
        $payload = $this->readToken($tokenHash);

        if (!$payload) {
            return response()->json([
                'ok' => false,
                'error' => 'Reset link is invalid or has already been used. Please request a new one from the login page.',
            ], 422);
        }

        if (($payload['email'] ?? '') !== $email
            || ($payload['portal'] ?? '') !== $portal
            || empty($payload['user_id'])
        ) {
            return response()->json([
                'ok' => false,
                'error' => 'Reset link does not match this email or portal. Open the link from your email again.',
            ], 422);
        }

        $expiresAt = isset($payload['expires_at']) ? strtotime((string) $payload['expires_at']) : false;
        if ($expiresAt === false || $expiresAt < time()) {
            $this->deleteToken($tokenHash);

            return response()->json([
                'ok' => false,
                'error' => 'Reset link has expired (valid for '.self::TOKEN_TTL_MINUTES.' minutes). Please request a new one.',
            ], 422);
        }

        $updated = $this->supabaseAuth->adminUpdatePassword((string) $payload['user_id'], $data['password']);
        if (!$updated) {
            return response()->json([
                'ok' => false,
                'error' => 'Could not update password. Please try again.',
            ], 500);
        }

        $this->deleteToken($tokenHash);
        $this->forgetTokensFor($email, $portal);

        return response()->json([
            'ok' => true,
            'message' => 'Password updated. You can now sign in with your new password.',
        ]);
    }

    private function buildResetEmailHtml(string $who, string $resetUrl, int $ttl, string $email): string
    {
        $safeUrl = e($resetUrl);
        $safeEmail = e($email);
        $safeWho = e($who);

        // Table-based layout for reliable rendering in Gmail.
        return <<<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your HealthTrack password</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
          <tr>
            <td style="background:#0f766e;padding:28px 32px;text-align:left;">
              <p style="margin:0;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#ccfbf1;font-weight:700;">HealthTrack · RHU Pila</p>
              <h1 style="margin:10px 0 0;font-size:24px;line-height:1.25;color:#ffffff;font-weight:700;">Reset your password</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;">
              <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#334155;">
                We received a request to reset the password for your HealthTrack <strong>{$safeWho}</strong> account
                (<strong>{$safeEmail}</strong>).
              </p>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#334155;">
                Click the button below to choose a new password. This link expires in <strong>{$ttl} minutes</strong>.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px;">
                <tr>
                  <td align="center" bgcolor="#0f766e" style="border-radius:10px;">
                    <a href="{$safeUrl}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;background:#0f766e;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748b;">
                If the button does not work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 22px;font-size:12px;line-height:1.5;word-break:break-all;">
                <a href="{$safeUrl}" target="_blank" rel="noopener noreferrer" style="color:#0f766e;text-decoration:underline;">{$safeUrl}</a>
              </p>
              <p style="margin:0;font-size:13px;line-height:1.5;color:#94a3b8;">
                If you did not request this, you can ignore this email. Your password will stay the same.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px 28px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
                Rural Health Unit of Pila, Laguna · HealthTrack
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
HTML;
    }

    private function buildResetEmailText(string $who, string $resetUrl, int $ttl): string
    {
        return "HealthTrack RHU Pila\n\n"
            ."Reset your {$who} password\n\n"
            ."Open this link within {$ttl} minutes:\n"
            ."{$resetUrl}\n\n"
            ."If you did not request this, ignore this email.\n";
    }

    private function tokenDir(): string
    {
        $dir = storage_path('app/password_resets');
        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        return $dir;
    }

    private function tokenFile(string $tokenHash): string
    {
        return $this->tokenDir().DIRECTORY_SEPARATOR.$tokenHash.'.json';
    }

    private function writeToken(string $tokenHash, array $payload): void
    {
        $path = $this->tokenFile($tokenHash);
        $json = json_encode($payload, JSON_THROW_ON_ERROR);
        if (file_put_contents($path, $json, LOCK_EX) === false) {
            throw new \RuntimeException('Could not store password reset token.');
        }
    }

    private function readToken(string $tokenHash): ?array
    {
        $path = $this->tokenFile($tokenHash);
        if (!is_file($path)) {
            return null;
        }

        try {
            $payload = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            @unlink($path);

            return null;
        }

        return is_array($payload) ? $payload : null;
    }

    private function deleteToken(string $tokenHash): void
    {
        $path = $this->tokenFile($tokenHash);
        if (is_file($path)) {
            @unlink($path);
        }
    }

    private function pruneExpiredTokens(): void
    {
        try {
            $files = glob($this->tokenDir().DIRECTORY_SEPARATOR.'*.json') ?: [];
            foreach ($files as $file) {
                try {
                    $payload = json_decode((string) file_get_contents($file), true);
                    $expiresAt = isset($payload['expires_at']) ? strtotime((string) $payload['expires_at']) : false;
                    if ($expiresAt === false || $expiresAt < time()) {
                        @unlink($file);
                    }
                } catch (\Throwable) {
                    @unlink($file);
                }
            }
        } catch (\Throwable $e) {
            Log::debug('[password-reset] prune skipped: '.$e->getMessage());
        }
    }

    private function forgetTokensFor(string $email, string $portal): void
    {
        try {
            $files = glob($this->tokenDir().DIRECTORY_SEPARATOR.'*.json') ?: [];
            foreach ($files as $file) {
                try {
                    $payload = json_decode((string) file_get_contents($file), true);
                    if (($payload['email'] ?? '') === $email && ($payload['portal'] ?? '') === $portal) {
                        @unlink($file);
                    }
                } catch (\Throwable) {
                    // ignore bad files
                }
            }
        } catch (\Throwable $e) {
            Log::debug('[password-reset] forget skipped: '.$e->getMessage());
        }
    }

    private function portalAllowsUser(string $portal, array $user): bool
    {
        $meta = is_array($user['user_metadata'] ?? null) ? $user['user_metadata'] : [];
        $metaRole = (string) ($meta['role'] ?? '');
        $metaApp = strtolower((string) ($meta['app'] ?? ''));

        if ($portal === 'staff') {
            $userId = (string) ($user['id'] ?? '');
            $profile = $userId !== '' ? $this->supabaseAuth->fetchStaffProfile($userId) : null;
            $role = $profile['role'] ?? null;

            return in_array($role, ['Doctor', 'Nurse', 'BHW', 'Volunteer'], true);
        }

        // Patient portal: reject staff accounts
        if (in_array($metaRole, ['Admin', 'Doctor', 'Nurse', 'BHW', 'Volunteer'], true)) {
            return false;
        }
        if ($metaApp !== '' && $metaApp !== 'patient') {
            return false;
        }

        return true;
    }
}
