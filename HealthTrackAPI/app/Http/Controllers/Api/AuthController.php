<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SupabasePasswordAuth;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class AuthController extends Controller
{
    public function __construct(private SupabasePasswordAuth $supabaseAuth)
    {
    }

    /**
     * POST /api/auth/login
     * Body: { email, password, portal: "staff"|"patient" }
     */
    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email|max:255',
            'password' => 'required|string|max:255',
            'portal' => 'required|string|in:staff,patient',
        ]);

        $grant = $this->supabaseAuth->passwordGrant($data['email'], $data['password']);
        if (!$grant) {
            return response()->json(['ok' => false, 'error' => 'Invalid login credentials'], 401);
        }

        $user = $grant['user'];
        $userId = $user['id'];
        $meta = is_array($user['user_metadata'] ?? null) ? $user['user_metadata'] : [];
        $appMeta = is_array($user['app_metadata'] ?? null) ? $user['app_metadata'] : [];

        $role = null;
        $profile = null;

        if ($data['portal'] === 'staff') {
            $profile = $this->supabaseAuth->fetchStaffProfile($userId);
            $role = $profile['role'] ?? null;
            if (!in_array($role, ['Doctor', 'Nurse'], true)) {
                $this->supabaseAuth->globalSignOut($grant['access_token']);

                return response()->json([
                    'ok' => false,
                    'error' => 'This account is not allowed here. Use an approved doctor or nurse account, or the Patient Portal.',
                ], 403);
            }
        } else {
            $metaRole = (string) ($meta['role'] ?? '');
            $metaApp = strtolower((string) ($meta['app'] ?? ''));
            if (in_array($metaRole, ['Admin', 'Doctor', 'Nurse'], true) || ($metaApp !== '' && $metaApp !== 'patient')) {
                $this->supabaseAuth->globalSignOut($grant['access_token']);

                return response()->json(['ok' => false, 'error' => 'Invalid login credentials'], 401);
            }
            $role = 'Patient';
        }

        // Prevent session fixation; isolate this browser's session.
        $request->session()->regenerate(true);

        $request->session()->put('ht_auth', [
            'portal' => $data['portal'],
            'user_id' => $userId,
            'email' => $user['email'] ?? $data['email'],
            'role' => $role,
            'name' => $profile['name'] ?? ($meta['name'] ?? ($meta['first_name'] ?? null)),
            'access_token' => $grant['access_token'],
            'refresh_token' => $grant['refresh_token'],
            'expires_at' => time() + max(60, (int) $grant['expires_in']),
            'user_metadata' => $meta,
            'app_metadata' => $appMeta,
            'profile' => $profile,
        ]);

        Log::info('[auth] login', [
            'portal' => $data['portal'],
            'user_id' => $userId,
            'role' => $role,
        ]);

        return response()->json([
            'ok' => true,
            'user' => [
                'id' => $userId,
                'email' => $user['email'] ?? $data['email'],
                'role' => $role,
                'name' => $profile['name'] ?? null,
                'user_metadata' => $meta,
            ],
            // Access JWT only — refresh stays in the HttpOnly server session (BFF).
            'supabase' => $this->publicSupabasePayload($grant['access_token'], time() + max(60, (int) $grant['expires_in'])),
        ]);
    }

    /**
     * GET /api/auth/me — recover session after refresh (cookie-based).
     */
    public function me(Request $request)
    {
        $auth = $request->attributes->get('ht_auth') ?? $request->session()->get('ht_auth');
        if (!is_array($auth) || empty($auth['user_id'])) {
            return response()->json(['ok' => false, 'error' => 'Unauthenticated'], 401);
        }

        return response()->json([
            'ok' => true,
            'user' => [
                'id' => $auth['user_id'],
                'email' => $auth['email'] ?? null,
                'role' => $auth['role'] ?? null,
                'name' => $auth['name'] ?? null,
                'user_metadata' => $auth['user_metadata'] ?? [],
            ],
            'supabase' => $this->publicSupabasePayload(
                (string) ($auth['access_token'] ?? ''),
                $auth['expires_at'] ?? null,
            ),
        ]);
    }

    /**
     * POST /api/auth/refresh — rotate Supabase tokens; keep same cookie session.
     */
    public function refresh(Request $request)
    {
        $auth = $request->session()->get('ht_auth');
        if (!is_array($auth) || empty($auth['refresh_token'])) {
            return response()->json(['ok' => false, 'error' => 'Unauthenticated'], 401);
        }

        $refreshed = $this->supabaseAuth->refresh((string) $auth['refresh_token']);
        if (!$refreshed) {
            $request->session()->forget('ht_auth');
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json(['ok' => false, 'error' => 'Session expired'], 401);
        }

        $auth['access_token'] = $refreshed['access_token'];
        $auth['refresh_token'] = $refreshed['refresh_token'];
        $auth['expires_at'] = time() + max(60, (int) $refreshed['expires_in']);
        $request->session()->put('ht_auth', $auth);

        return response()->json([
            'ok' => true,
            'supabase' => $this->publicSupabasePayload(
                (string) $auth['access_token'],
                $auth['expires_at'],
            ),
        ]);
    }

    /**
     * POST /api/auth/logout
     */
    public function logout(Request $request)
    {
        $auth = $request->session()->get('ht_auth');
        if (is_array($auth) && !empty($auth['access_token'])) {
            $this->supabaseAuth->globalSignOut((string) $auth['access_token']);
        }

        $request->session()->forget('ht_auth');
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['ok' => true]);
    }

    /**
     * Browser-facing token payload: never include the Supabase refresh token.
     * Clients bootstrap RLS with the access JWT; Laravel rotates refresh server-side.
     */
    private function publicSupabasePayload(string $accessToken, $expiresAt): array
    {
        return [
            'access_token' => $accessToken,
            'expires_at' => $expiresAt,
        ];
    }
}
