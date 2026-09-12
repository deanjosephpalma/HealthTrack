<?php

namespace App\Http\Middleware;

use App\Services\SupabasePasswordAuth;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Requires an authenticated Laravel session (Sanctum SPA cookie).
 * Refresh Supabase tokens server-side when near expiry.
 */
class EnsurePortalSession
{
    public function __construct(private SupabasePasswordAuth $supabaseAuth)
    {
    }

    public function handle(Request $request, Closure $next, ?string $portal = null): Response
    {
        if (!$request->hasSession()) {
            return response()->json(['ok' => false, 'error' => 'Unauthenticated'], 401);
        }

        $auth = $request->session()->get('ht_auth');
        if (!is_array($auth) || empty($auth['user_id']) || empty($auth['access_token'])) {
            return response()->json(['ok' => false, 'error' => 'Unauthenticated'], 401);
        }

        if ($portal && ($auth['portal'] ?? null) !== $portal) {
            return response()->json(['ok' => false, 'error' => 'Wrong portal session'], 403);
        }

        // Do not let an already-open staff session survive an employment status change.
        if (($auth['portal'] ?? null) === 'staff') {
            $profile = $this->supabaseAuth->fetchStaffProfile((string) $auth['user_id']);
            if (!$profile || ($profile['employment_status'] ?? 'Active') === 'Resigned') {
                $this->supabaseAuth->globalSignOut((string) ($auth['access_token'] ?? ''));
                $request->session()->forget('ht_auth');
                $request->session()->invalidate();
                $request->session()->regenerateToken();

                return response()->json([
                    'ok' => false,
                    'error' => 'This staff account has been marked as resigned and no longer has access.',
                ], 403);
            }
        }

        $expiresAt = (int) ($auth['expires_at'] ?? 0);
        if ($expiresAt > 0 && $expiresAt < time() + 60) {
            $refreshed = $this->supabaseAuth->refresh((string) ($auth['refresh_token'] ?? ''));
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
        }

        $request->attributes->set('ht_auth', $auth);
        $request->attributes->set('supabase_user_id', $auth['user_id']);
        $request->attributes->set('supabase_role', $auth['role'] ?? null);
        $request->attributes->set('supabase_access_token', $auth['access_token']);

        // Compatibility with existing JWT middleware consumers
        $request->attributes->set('supabase_jwt', [
            'sub' => $auth['user_id'],
            'email' => $auth['email'] ?? null,
            'role' => 'authenticated',
            'user_metadata' => $auth['user_metadata'] ?? [],
            'app_metadata' => $auth['app_metadata'] ?? [],
        ]);

        return $next($request);
    }
}
