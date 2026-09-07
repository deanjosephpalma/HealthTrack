<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class AiController extends Controller
{
    public function generate(Request $request)
    {
        $data = $request->validate([
            'mode' => 'required|string|in:clinical_summary,smart_diagnosis,health_plan,gis_insights',
            'payload' => 'required|array',
        ]);

        $apiKey = (string) config('services.gemini.key');
        $model = (string) config('services.gemini.model', 'gemini-2.5-flash');

        if ($apiKey === '') {
            return response()->json([
                'ok' => false,
                'error' => 'AI feature is disabled on the server.',
                'text' => 'AI feature is disabled: No API key configured on server.',
            ], 503);
        }

        $prompt = $this->buildPrompt($data['mode'], $data['payload']);
        if ($prompt === null) {
            return response()->json(['ok' => false, 'error' => 'Invalid payload for mode.'], 422);
        }

        try {
            $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}";
            $response = Http::timeout(60)->post($url, [
                'contents' => [
                    ['parts' => [['text' => $prompt]]],
                ],
            ]);

            if (!$response->successful()) {
                Log::warning('[ai] Gemini error', ['status' => $response->status(), 'body' => $response->body()]);

                return response()->json([
                    'ok' => false,
                    'error' => 'AI provider request failed.',
                    'text' => 'Failed to generate AI response. Please try again later.',
                ], 502);
            }

            $text = (string) data_get($response->json(), 'candidates.0.content.parts.0.text', '');

            if ($data['mode'] === 'gis_insights') {
                $jsonMatch = [];
                if (preg_match('/\[[\s\S]*\]/', $text, $jsonMatch)) {
                    $parsed = json_decode($jsonMatch[0], true);
                    if (is_array($parsed)) {
                        return response()->json(['ok' => true, 'insights' => $parsed]);
                    }
                }

                return response()->json(['ok' => true, 'insights' => $text !== '' ? [$text] : []]);
            }

            return response()->json(['ok' => true, 'text' => $text !== '' ? $text : 'No response from AI.']);
        } catch (\Throwable $e) {
            Log::error('[ai] exception: '.$e->getMessage());

            return response()->json([
                'ok' => false,
                'error' => 'AI request failed.',
                'text' => 'Failed to generate AI response. Please try again later.',
            ], 500);
        }
    }

    private function buildPrompt(string $mode, array $payload): ?string
    {
        return match ($mode) {
            'clinical_summary' => sprintf(
                "You are a specialized medical AI assistant for the Rural Health Unit of Pila.\nProvide a concise clinical summary.\nPatient Info:\n%s\nMedical Records:\n%s\nFormat as a short clinical brief in markdown.",
                json_encode($payload['patientInfo'] ?? [], JSON_PRETTY_PRINT),
                json_encode($payload['medicalRecords'] ?? [], JSON_PRETTY_PRINT)
            ),
            'smart_diagnosis' => sprintf(
                "You are a medical AI assistant helping document a consultation.\nSuggest possible preliminary diagnoses, follow-up questions, and next steps.\nSymptoms: %s\nVitals: %s\nRespond in markdown. Remind the user this requires clinical validation.",
                (string) ($payload['symptoms'] ?? ''),
                json_encode($payload['vitals'] ?? [], JSON_PRETTY_PRINT)
            ),
            'health_plan' => sprintf(
                "You are an Epidemiologist for RHU Pila. Generate a strategic Health Planning Report from:\n%s\nInclude executive summary, top diseases/barangays, recommendations, risk forecast. Markdown.",
                json_encode($payload['stats'] ?? [], JSON_PRETTY_PRINT)
            ),
            'gis_insights' => sprintf(
                "You are the AI Tactical Coordinator for an Outbreak Command Center.\nReview GIS data:\n%s\nReturn exactly 3 to 5 short actionable insights as a JSON array of strings only.",
                json_encode($payload['gisData'] ?? [], JSON_PRETTY_PRINT)
            ),
            default => null,
        };
    }
}
