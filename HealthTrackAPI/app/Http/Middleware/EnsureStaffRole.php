<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response;

class EnsureStaffRole
{
    private const STAFF_ROLES = ['Doctor', 'Nurse', 'BHW', 'Volunteer'];

    public function handle(Request $request, Closure $next): Response
    {
        $userId = $request->attributes->get('supabase_user_id');
        if (!$userId) {
            return response()->json(['ok' => false, 'error' => 'Unauthorized'], 401);
        }

        $role = $this->resolveRole($userId, $request->attributes->get('supabase_jwt', []));
        if (!in_array($role, self::STAFF_ROLES, true)) {
            return response()->json(['ok' => false, 'error' => 'Forbidden'], 403);
        }

        $request->attributes->set('supabase_role', $role);

        return $next($request);
    }

    private function resolveRole(string $userId, array $jwt): ?string
    {
        $metaRole = data_get($jwt, 'app_metadata.role')
            ?? data_get($jwt, 'user_metadata.role');
        if (in_array($metaRole, self::STAFF_ROLES, true)) {
            return $metaRole;
        }

        $url = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = (string) config('services.supabase.service_role_key');
        if ($url === '' || $serviceKey === '') {
            return null;
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $serviceKey,
                'Authorization' => 'Bearer '.$serviceKey,
            ])->get("{$url}/rest/v1/profiles", [
                'id' => 'eq.'.$userId,
                'select' => 'role',
            ]);

            if (!$response->successful()) {
                return null;
            }

            $rows = $response->json();
            $role = is_array($rows) && isset($rows[0]['role']) ? $rows[0]['role'] : null;

            return in_array($role, self::STAFF_ROLES, true) ? $role : null;
        } catch (\Throwable) {
            return null;
        }
    }
}
