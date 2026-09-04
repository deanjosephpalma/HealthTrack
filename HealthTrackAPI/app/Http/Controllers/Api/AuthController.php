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
     * Body: { email?, username?, password, portal: "staff"|"patient" }
     * Patient portal accepts username (0001) or legacy email.
     */
    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => 'nullable|string|max:255',
            'username' => 'nullable|string|max:32',
            'password' => 'required|string|max:255',
            'portal' => 'required|string|in:staff,patient',
        ]);

        $email = trim((string) ($data['email'] ?? ''));
        $username = trim((string) ($data['username'] ?? ''));

        if ($data['portal'] === 'patient') {
            if ($username !== '') {
                $email = \App\Http\Controllers\Api\PatientRegisterController::authEmailFromUsername($username);
            } elseif ($email !== '' && !str_contains($email, '@')) {
                $email = \App\Http\Controllers\Api\PatientRegisterController::authEmailFromUsername($email);
            }
        }

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return response()->json([
                'ok' => false,
                'error' => $data['portal'] === 'patient'    
                    ? 'Enter your username (e.g. 4010-0001) and password.'
                    : 'Invalid login credentials',
            ], 422);
        }

        $grant = $this->supabaseAuth->passwordGrant($email, $data['password']);
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
            if (!in_array($role, ['Doctor', 'Nurse', 'BHW', 'Volunteer'], true)) {
                $this->supabaseAuth->globalSignOut($grant['access_token']);

                return response()->json([
                    'ok' => false,
                    'error' => 'This account is not allowed here. Use an approved Doctor, Nurse, BHW, or Volunteer account, or the Patient Portal.',
                ], 403);
            }
        } else {
            $metaRole = (string) ($meta['role'] ?? '');
            $metaApp = strtolower((string) ($meta['app'] ?? ''));
            if (in_array($metaRole, ['Admin', 'Doctor', 'Nurse', 'BHW', 'Volunteer'], true) || ($metaApp !== '' && $metaApp !== 'patient')) {
                $this->supabaseAuth->globalSignOut($grant['access_token']);

                return response()->json(['ok' => false, 'error' => 'Invalid login credentials'], 401);
            }
            $role = 'Patient';

            // Phone/username accounts are pre-confirmed; skip email OTP gate.
            $authMode = strtolower((string) ($meta['auth_mode'] ?? ''));
            $authEmail = strtolower((string) ($user['email'] ?? $email));
            $isPhoneUsername = $authMode === 'phone_username'
                || str_ends_with($authEmail, '@patient.healthtrack.local');
            $metaVerified = filter_var($meta['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);
            $confirmedAt = $user['email_confirmed_at'] ?? null;
            $providers = $appMeta['providers'] ?? [];
            if (!is_array($providers)) {
                $providers = [];
            }
            $provider = strtolower((string) ($appMeta['provider'] ?? ''));
            $isGoogle = $provider === 'google' || in_array('google', $providers, true);
            $isVerified = $isPhoneUsername || $metaVerified || !empty($confirmedAt) || $isGoogle;

            if (!$isVerified) {
                $request->session()->regenerate(true);
                $request->session()->put('ht_auth', [
                    'portal' => 'patient',
                    'user_id' => $userId,
                    'email' => $user['email'] ?? $email,
                    'role' => 'Patient',
                    'name' => $meta['name'] ?? ($meta['first_name'] ?? null),
                    'access_token' => $grant['access_token'],
                    'refresh_token' => $grant['refresh_token'],
                    'expires_at' => time() + max(60, (int) $grant['expires_in']),
                    'user_metadata' => $meta,
                    'app_metadata' => $appMeta,
                    'profile' => null,
                    'email_verified' => false,
                ]);

                return response()->json([
                    'ok' => false,
                    'needsVerification' => true,
                    'error' => 'Please verify your email before signing in.',
                    'user' => [
                        'id' => $userId,
                        'email' => $user['email'] ?? $email,
                    ],
                    'supabase' => $this->publicSupabasePayload($grant['access_token'], time() + max(60, (int) $grant['expires_in'])),
                ], 403);
            }
        }

        // Prevent session fixation; isolate this browser's session.
        $request->session()->regenerate(true);

        $request->session()->put('ht_auth', [
            'portal' => $data['portal'],
            'user_id' => $userId,
            'email' => $user['email'] ?? $email,
            'role' => $role,
            'name' => $profile['name'] ?? ($meta['name'] ?? ($meta['first_name'] ?? null)),
            'access_token' => $grant['access_token'],
            'refresh_token' => $grant['refresh_token'],
            'expires_at' => time() + max(60, (int) $grant['expires_in']),
            'user_metadata' => $meta,
            'app_metadata' => $appMeta,
            'profile' => $profile,
            'email_verified' => true,
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
                'email' => $user['email'] ?? $email,
                'role' => $role,
                'name' => $profile['name'] ?? null,
                'user_metadata' => $meta,
                'portal_username' => $meta['portal_username'] ?? null,
            ],
            // Access JWT only — refresh stays in the HttpOnly server session (BFF).
            'supabase' => $this->publicSupabasePayload($grant['access_token'], time() + max(60, (int) $grant['expires_in'])),
        ]);
    }

    /**
     * POST /api/auth/bridge-session
     * Establish a patient Laravel session from a Supabase access token
     * (email/password signup session or Google OAuth).
     */
    public function bridgeSession(Request $request)
    {
        $data = $request->validate([
            'access_token' => 'required|string|min:20',
            'refresh_token' => 'nullable|string',
            'portal' => 'required|string|in:patient',
            'expires_in' => 'nullable|integer|min:60|max:86400',
        ]);

        $user = $this->supabaseAuth->fetchUserByAccessToken($data['access_token']);
        if (!$user) {
            return response()->json(['ok' => false, 'error' => 'Invalid session token.'], 401);
        }

        $userId = (string) $user['id'];
        $meta = is_array($user['user_metadata'] ?? null) ? $user['user_metadata'] : [];
        $appMeta = is_array($user['app_metadata'] ?? null) ? $user['app_metadata'] : [];
        $metaRole = (string) ($meta['role'] ?? '');
        $metaApp = strtolower((string) ($meta['app'] ?? ''));

        if (in_array($metaRole, ['Admin', 'Doctor', 'Nurse', 'BHW', 'Volunteer'], true)
            || ($metaApp !== '' && $metaApp !== 'patient')
        ) {
            return response()->json(['ok' => false, 'error' => 'Invalid login credentials'], 401);
        }

        // Tag Google / OAuth patients as patient app if metadata is empty.
        if ($metaApp === '') {
            $meta['app'] = 'patient';
        }

        $providers = $appMeta['providers'] ?? [];
        if (!is_array($providers)) {
            $providers = [];
        }
        $provider = strtolower((string) ($appMeta['provider'] ?? ''));
        $isGoogle = $provider === 'google' || in_array('google', $providers, true);
        $metaVerified = filter_var($meta['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $isVerified = $metaVerified || !empty($user['email_confirmed_at']) || $isGoogle;

        $request->session()->regenerate(true);
        $expiresIn = (int) ($data['expires_in'] ?? 3600);
        $request->session()->put('ht_auth', [
            'portal' => 'patient',
            'user_id' => $userId,
            'email' => $user['email'] ?? null,
            'role' => 'Patient',
            'name' => $meta['name'] ?? ($meta['first_name'] ?? null),
            'access_token' => $data['access_token'],
            'refresh_token' => $data['refresh_token'] ?? '',
            'expires_at' => time() + max(60, $expiresIn),
            'user_metadata' => $meta,
            'app_metadata' => $appMeta,
            'profile' => null,
            'email_verified' => $isVerified,
        ]);

        return response()->json([
            'ok' => true,
            'needsVerification' => !$isVerified,
            'user' => [
                'id' => $userId,
                'email' => $user['email'] ?? null,
                'role' => 'Patient',
                'user_metadata' => $meta,
            ],
            'supabase' => $this->publicSupabasePayload($data['access_token'], time() + max(60, $expiresIn)),
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
