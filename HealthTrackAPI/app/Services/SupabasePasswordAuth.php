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

            return in_array($role, ['Doctor', 'Nurse', 'BHW', 'Volunteer'], true) ? $role : null;
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
                'select' => 'id,role,name,email,employment_status',
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

    /**
     * Resolve the authenticated Supabase user from an access JWT.
     *
     * @return array{id: string, email?: string, email_confirmed_at?: string|null, user_metadata?: array, app_metadata?: array}|null
     */
    public function fetchUserByAccessToken(string $accessToken): ?array
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $anon = (string) config('services.supabase.anon_key');
        if ($url === '' || $anon === '' || $accessToken === '') {
            return null;
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $anon,
                'Authorization' => 'Bearer '.$accessToken,
            ])->timeout(15)->get("{$url}/auth/v1/user");

            if (!$response->successful()) {
                return null;
            }

            $user = $response->json();
            if (!is_array($user) || empty($user['id'])) {
                return null;
            }

            return $user;
        } catch (\Throwable $e) {
            Log::warning('[supabase-auth] fetchUserByAccessToken failed: '.$e->getMessage());

            return null;
        }
    }

    /**
     * Find an auth user by email via Admin API (paginated scan — fine for RHU scale).
     *
     * @return array{id: string, email?: string, user_metadata?: array}|null
     */
    public function findAuthUserByEmail(string $email): ?array
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = (string) config('services.supabase.service_role_key');
        $needle = strtolower(trim($email));
        if ($url === '' || $serviceKey === '' || $needle === '') {
            return null;
        }

        try {
            $page = 1;
            while ($page <= 20) {
                $response = Http::withHeaders([
                    'apikey' => $serviceKey,
                    'Authorization' => 'Bearer '.$serviceKey,
                ])->timeout(20)->get("{$url}/auth/v1/admin/users", [
                    'page' => $page,
                    'per_page' => 100,
                ]);

                if (!$response->successful()) {
                    Log::warning('[supabase-auth] list users failed: '.$response->body());

                    return null;
                }

                $json = $response->json();
                $users = is_array($json['users'] ?? null) ? $json['users'] : (is_array($json) ? $json : []);
                if ($users === []) {
                    return null;
                }

                foreach ($users as $user) {
                    if (!is_array($user)) {
                        continue;
                    }
                    $userEmail = strtolower(trim((string) ($user['email'] ?? '')));
                    if ($userEmail === $needle && !empty($user['id'])) {
                        return $user;
                    }
                }

                if (count($users) < 100) {
                    return null;
                }
                $page++;
            }
        } catch (\Throwable $e) {
            Log::warning('[supabase-auth] findAuthUserByEmail failed: '.$e->getMessage());
        }

        return null;
    }

    public function adminUpdatePassword(string $userId, string $password): bool
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = (string) config('services.supabase.service_role_key');
        if ($url === '' || $serviceKey === '' || $userId === '' || $password === '') {
            return false;
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $serviceKey,
                'Authorization' => 'Bearer '.$serviceKey,
                'Content-Type' => 'application/json',
            ])->timeout(20)->put("{$url}/auth/v1/admin/users/{$userId}", [
                'password' => $password,
            ]);

            if (!$response->successful()) {
                Log::warning('[supabase-auth] adminUpdatePassword failed: '.$response->body());

                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::warning('[supabase-auth] adminUpdatePassword exception: '.$e->getMessage());

            return false;
        }
    }

    /**
     * Create a confirmed patient auth user (phone/username flow).
     *
     * @param  array{email: string, password: string, user_metadata?: array}  $payload
     */
    public function adminCreatePatientUser(array $payload): ?string
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = (string) config('services.supabase.service_role_key');
        $email = trim((string) ($payload['email'] ?? ''));
        $password = (string) ($payload['password'] ?? '');
        if ($url === '' || $serviceKey === '' || $email === '' || $password === '') {
            return null;
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $serviceKey,
                'Authorization' => 'Bearer '.$serviceKey,
                'Content-Type' => 'application/json',
            ])->timeout(25)->post("{$url}/auth/v1/admin/users", [
                'email' => $email,
                'password' => $password,
                'email_confirm' => true,
                'user_metadata' => is_array($payload['user_metadata'] ?? null) ? $payload['user_metadata'] : [],
            ]);

            if (!$response->successful()) {
                Log::warning('[supabase-auth] adminCreatePatientUser failed: '.$response->body());

                return null;
            }

            $json = $response->json();
            $id = is_array($json) ? (string) ($json['id'] ?? '') : '';

            return $id !== '' ? $id : null;
        } catch (\Throwable $e) {
            Log::warning('[supabase-auth] adminCreatePatientUser exception: '.$e->getMessage());

            return null;
        }
    }

    /**
     * Create a confirmed staff user that can be linked to a profile by the account manager.
     *
     * @param  array{email: string, password: string, user_metadata?: array}  $payload
     */
    public function adminCreateStaffUser(array $payload): ?string
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = (string) config('services.supabase.service_role_key');
        $email = trim((string) ($payload['email'] ?? ''));
        $password = (string) ($payload['password'] ?? '');
        if ($url === '' || $serviceKey === '' || $email === '' || $password === '') {
            return null;
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $serviceKey,
                'Authorization' => 'Bearer '.$serviceKey,
                'Content-Type' => 'application/json',
            ])->timeout(25)->post("{$url}/auth/v1/admin/users", [
                'email' => $email,
                'password' => $password,
                'email_confirm' => true,
                'user_metadata' => is_array($payload['user_metadata'] ?? null) ? $payload['user_metadata'] : [],
            ]);

            if (!$response->successful()) {
                Log::warning('[supabase-auth] adminCreateStaffUser failed: '.$response->body());

                return null;
            }

            $json = $response->json();
            $id = is_array($json) ? (string) ($json['id'] ?? '') : '';

            return $id !== '' ? $id : null;
        } catch (\Throwable $e) {
            Log::warning('[supabase-auth] adminCreateStaffUser exception: '.$e->getMessage());

            return null;
        }
    }

    /** Ban a user at the Supabase Auth layer; use "none" to restore access. */
    public function adminSetUserBan(string $userId, ?string $banDuration): bool
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = (string) config('services.supabase.service_role_key');
        if ($url === '' || $serviceKey === '' || $userId === '') {
            return false;
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $serviceKey,
                'Authorization' => 'Bearer '.$serviceKey,
                'Content-Type' => 'application/json',
            ])->timeout(20)->put("{$url}/auth/v1/admin/users/{$userId}", [
                'ban_duration' => $banDuration ?? 'none',
            ]);

            if (!$response->successful()) {
                Log::warning('[supabase-auth] adminSetUserBan failed: '.$response->body());

                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::warning('[supabase-auth] adminSetUserBan exception: '.$e->getMessage());

            return false;
        }
    }

    /**
     * Update email + metadata after username is assigned.
     *
     * @param  array{email?: string, email_confirm?: bool, user_metadata?: array}  $payload
     */
    public function adminUpdatePatientIdentity(string $userId, array $payload): bool
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = (string) config('services.supabase.service_role_key');
        if ($url === '' || $serviceKey === '' || $userId === '') {
            return false;
        }

        try {
            $body = [];
            if (!empty($payload['email'])) {
                $body['email'] = $payload['email'];
            }
            if (array_key_exists('email_confirm', $payload)) {
                $body['email_confirm'] = (bool) $payload['email_confirm'];
            }
            if (is_array($payload['user_metadata'] ?? null)) {
                $body['user_metadata'] = $payload['user_metadata'];
            }

            $response = Http::withHeaders([
                'apikey' => $serviceKey,
                'Authorization' => 'Bearer '.$serviceKey,
                'Content-Type' => 'application/json',
            ])->timeout(20)->put("{$url}/auth/v1/admin/users/{$userId}", $body);

            if (!$response->successful()) {
                Log::warning('[supabase-auth] adminUpdatePatientIdentity failed: '.$response->body());

                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::warning('[supabase-auth] adminUpdatePatientIdentity exception: '.$e->getMessage());

            return false;
        }
    }
}
