<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Minimal Supabase PostgREST / RPC client (service role or user JWT).
 */
class SupabaseRest
{
    public function get(string $path, array $query = [], ?string $accessToken = null): array
    {
        return $this->request('GET', $path, $query, null, $accessToken);
    }

    public function post(string $path, array $body = [], ?string $accessToken = null): array
    {
        return $this->request('POST', $path, [], $body, $accessToken);
    }

    public function rpc(string $fn, array $args = [], ?string $accessToken = null): array
    {
        return $this->post("rest/v1/rpc/{$fn}", $args, $accessToken);
    }

    private function request(
        string $method,
        string $path,
        array $query,
        ?array $body,
        ?string $accessToken
    ): array {
        $base = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = (string) config('services.supabase.service_role_key');
        $anon = (string) config('services.supabase.anon_key');
        $apikey = $serviceKey !== '' ? $serviceKey : $anon;
        $bearer = $accessToken ?: $apikey;

        if ($base === '' || $apikey === '') {
            throw new \RuntimeException('Supabase is not configured on the API.');
        }

        $url = $base.'/'.ltrim($path, '/');
        $pending = Http::withHeaders([
            'apikey' => $apikey,
            'Authorization' => 'Bearer '.$bearer,
            'Accept' => 'application/json',
            'Content-Type' => 'application/json',
        ])->timeout(30);

        $response = match (strtoupper($method)) {
            'GET' => $pending->get($url, $query),
            'POST' => $pending->post($url, $body ?? []),
            default => throw new \InvalidArgumentException("Unsupported method {$method}"),
        };

        if (!$response->successful()) {
            Log::warning('[supabase-rest] request failed', [
                'path' => $path,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
            throw new \RuntimeException('Supabase request failed (HTTP '.$response->status().').');
        }

        $json = $response->json();
        return is_array($json) ? $json : [];
    }
}
