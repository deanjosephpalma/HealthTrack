<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class SupabaseJwt
{
    /**
     * Decode and verify a Supabase HS256 access token, or validate via Auth API.
     *
     * @return array{sub: string, role?: string, email?: string, app_metadata?: array, user_metadata?: array}|null
     */
    public static function decode(?string $token): ?array
    {
        if (!$token) {
            return null;
        }

        $secret = (string) config('services.supabase.jwt_secret', '');
        if ($secret !== '') {
            $payload = self::decodeWithSecret($token, $secret);
            if ($payload) {
                return $payload;
            }
        }

        return self::validateViaAuthApi($token);
    }

    public static function tokenFromRequest(Request $request): ?string
    {
        $header = $request->header('Authorization', '');
        if (preg_match('/^Bearer\s+(.+)$/i', $header, $m)) {
            return trim($m[1]);
        }

        return null;
    }

    private static function decodeWithSecret(string $token, string $secret): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$headerB64, $payloadB64, $signatureB64] = $parts;

        $expected = self::base64UrlEncode(
            hash_hmac('sha256', $headerB64.'.'.$payloadB64, $secret, true)
        );

        if (!hash_equals($expected, $signatureB64)) {
            return null;
        }

        $payloadJson = self::base64UrlDecode($payloadB64);
        $payload = json_decode($payloadJson, true);
        if (!is_array($payload) || empty($payload['sub'])) {
            return null;
        }

        if (isset($payload['exp']) && (int) $payload['exp'] < time()) {
            return null;
        }

        return $payload;
    }

    /**
     * Fallback when SUPABASE_JWT_SECRET is not set: ask Supabase Auth if the token is valid.
     */
    private static function validateViaAuthApi(string $token): ?array
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $anon = (string) config('services.supabase.anon_key');
        if ($url === '' || $anon === '') {
            return null;
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $anon,
                'Authorization' => 'Bearer '.$token,
            ])->timeout(10)->get("{$url}/auth/v1/user");

            if (!$response->successful()) {
                return null;
            }

            $user = $response->json();
            if (!is_array($user) || empty($user['id'])) {
                return null;
            }

            return [
                'sub' => $user['id'],
                'email' => $user['email'] ?? null,
                'role' => 'authenticated',
                'app_metadata' => $user['app_metadata'] ?? [],
                'user_metadata' => $user['user_metadata'] ?? [],
            ];
        } catch (\Throwable) {
            return null;
        }
    }

    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }

        return (string) base64_decode(strtr($data, '-_', '+/'));
    }
}
