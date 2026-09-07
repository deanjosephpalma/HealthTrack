<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Isolate staff vs patient session cookies so simultaneous portals
 * on the same host never share login state.
 */
class ConfigurePortalSessionCookie
{
    public function handle(Request $request, Closure $next): Response
    {
        $portal = strtolower((string) (
            $request->header('X-HealthTrack-Portal')
            ?? $request->input('portal')
            ?? ''
        ));

        if ($portal === 'patient') {
            config([
                'session.cookie' => env('SESSION_COOKIE_PATIENT', 'ht_patient_session'),
            ]);
        } elseif ($portal === 'staff') {
            config([
                'session.cookie' => env('SESSION_COOKIE_STAFF', 'ht_staff_session'),
            ]);
        } else {
            // No portal header: pick cookie from an already-present portal cookie (same-origin CSRF/bootstrap),
            // otherwise require staff only for non-auth CSRF; never invent patient as staff.
            $patientCookie = env('SESSION_COOKIE_PATIENT', 'ht_patient_session');
            $staffCookie = env('SESSION_COOKIE_STAFF', 'ht_staff_session');
            if ($request->cookies->has($patientCookie) && !$request->cookies->has($staffCookie)) {
                config(['session.cookie' => $patientCookie]);
            } else {
                config(['session.cookie' => $staffCookie]);
            }
        }

        return $next($request);
    }
}
