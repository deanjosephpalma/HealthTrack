<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SupabaseRest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class HeatMapController extends Controller
{
    public function __construct(private SupabaseRest $supabase)
    {
    }

    /**
     * GET /api/heatmap/pila-diseases
     * Aggregated barangay × disease counts from Supabase (not local SQLite).
     */
    public function pilaDiseases(Request $request)
    {
        $data = $request->validate([
            'disease' => 'nullable|string|max:120',
            'barangay' => 'nullable|string|max:120',
        ]);

        $disease = $data['disease'] ?? null;
        $barangay = $data['barangay'] ?? null;
        if ($disease === 'all') {
            $disease = null;
        }
        if ($barangay === 'all') {
            $barangay = null;
        }

        $userToken = (string) $request->attributes->get('supabase_access_token', '');

        try {
            $rows = $this->supabase->rpc('heatmap_pila_disease_counts', [
                'p_disease' => $disease,
                'p_barangay' => $barangay,
            ], $userToken !== '' ? $userToken : null);

            if (!is_array($rows)) {
                $rows = [];
            }

            // Normalize to the public contract (string keys, numeric count).
            $out = array_map(static function ($row) {
                $row = is_array($row) ? $row : (array) $row;

                return [
                    'barangay' => (string) ($row['barangay'] ?? ''),
                    'disease' => (string) ($row['disease'] ?? ''),
                    'count' => (int) ($row['count'] ?? 0),
                    'lat' => isset($row['lat']) ? (float) $row['lat'] : null,
                    'lng' => isset($row['lng']) ? (float) $row['lng'] : null,
                ];
            }, $rows);

            return response()->json($out);
        } catch (\Throwable $error) {
            Log::error('Heatmap API failed', [
                'message' => $error->getMessage(),
            ]);

            return response()->json([
                'ok' => false,
                'error' => 'Heat map data unavailable. Confirm phase3_performance.sql is applied and SUPABASE_* is configured.',
            ], 503);
        }
    }
}
