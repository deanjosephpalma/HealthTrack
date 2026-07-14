<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SupabasePasswordAuth
{
    /**
     * Authenticate email/password against Supabase Auth (server-side).
     *
     * @return array{user: array, access_token: string, refresh_token: string, expires_in: int}|null
     */
    public function passwordGrant(string $email, string $password): ?array
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $anon = (string) config('services.supabase.anon_key');
        if ($url === '' || $anon === '') {
            return null;
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $anon,
                'Content-Type' => 'application/json',
            ])->timeout(20)->post("{$url}/auth/v1/token?grant_type=password", [
                'email' => $email,
                'password' => $password,
            ]);

            if (!$response->successful()) {
                return null;
            }

            $json = $response->json();
            if (!is_array($json) || empty($json['access_token']) || empty($json['user']['id'])) {
                return null;
            }

            return [
                'user' => $json['user'],
                'access_token' => $json['access_token'],
                'refresh_token' => $json['refresh_token'] ?? '',
                'expires_in' => (int) ($json['expires_in'] ?? 3600),
            ];
        } catch (\Throwable $e) {
            Log::warning('[supabase-auth] password grant failed: '.$e->getMessage());

            return null;
        }
    }

    public function refresh(string $refreshToken): ?array
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $anon = (string) config('services.supabase.anon_key');
        if ($url === '' || $anon === '' || $refreshToken === '') {
            return null;
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $anon,
                'Content-Type' => 'application/json',
            ])->timeout(20)->post("{$url}/auth/v1/token?grant_type=refresh_token", [
                'refresh_token' => $refreshToken,
            ]);

            if (!$response->successful()) {
                return null;
            }

            $json = $response->json();
            if (!is_array($json) || empty($json['access_token'])) {
                return null;
            }

            return [
                'access_token' => $json['access_token'],
                'refresh_token' => $json['refresh_token'] ?? $refreshToken,
                'expires_in' => (int) ($json['expires_in'] ?? 3600),
                'user' => $json['user'] ?? null,
            ];
        } catch (\Throwable $e) {
            Log::warning('[supabase-auth] refresh failed: '.$e->getMessage());

            return null;
        }
    }

    public function fetchStaffRole(string $userId): ?string
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = (string) config('services.supabase.service_role_key');
        if ($url === '' || $serviceKey === '') {
            return null;
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $serviceKey,
                'Authorization' => 'Bearer '.$serviceKey,
            ])->timeout(15)->get("{$url}/rest/v1/profiles", [
                'id' => 'eq.'.$userId,
                'select' => 'role,name,email',
            ]);

            if (!$response->successful()) {
                return null;
            }

            $rows = $response->json();
            $role = is_array($rows) && isset($rows[0]['role']) ? $rows[0]['role'] : null;

            return in_array($role, ['Doctor', 'Nurse'], true) ? $role : null;
        } catch (\Throwable) {
            return null;
        }
    }

    public function fetchStaffProfile(string $userId): ?array
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = (string) config('services.supabase.service_role_key');
        if ($url === '' || $serviceKey === '') {
            return null;
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $serviceKey,
                'Authorization' => 'Bearer '.$serviceKey,
            ])->timeout(15)->get("{$url}/rest/v1/profiles", [
                'id' => 'eq.'.$userId,
                'select' => 'id,role,name,email',
            ]);

            if (!$response->successful()) {
                return null;
            }

            $rows = $response->json();

            return is_array($rows) && isset($rows[0]) ? $rows[0] : null;
        } catch (\Throwable) {
            return null;
        }
    }

    public function globalSignOut(string $accessToken): void
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $anon = (string) config('services.supabase.anon_key');
        if ($url === '' || $anon === '' || $accessToken === '') {
            return;
        }

        try {
            Http::withHeaders([
                'apikey' => $anon,
                'Authorization' => 'Bearer '.$accessToken,
            ])->timeout(10)->post("{$url}/auth/v1/logout", [
                'scope' => 'global',
            ]);
        } catch (\Throwable) {
            // best-effort
        }
    }
}
