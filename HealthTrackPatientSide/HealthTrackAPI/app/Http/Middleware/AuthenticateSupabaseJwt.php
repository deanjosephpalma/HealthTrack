<?php

namespace App\Http\Middleware;

use App\Services\SupabaseJwt;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateSupabaseJwt
{
    public function handle(Request $request, Closure $next): Response
    {
        $token = SupabaseJwt::tokenFromRequest($request);
        $payload = SupabaseJwt::decode($token);

        if (!$payload) {
            return response()->json(['ok' => false, 'error' => 'Unauthorized'], 401);
        }

        $request->attributes->set('supabase_jwt', $payload);
        $request->attributes->set('supabase_user_id', $payload['sub']);

        return $next($request);
    }
}
