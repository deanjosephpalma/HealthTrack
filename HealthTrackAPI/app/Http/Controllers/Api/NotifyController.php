<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class NotifyController extends Controller
{
    /** Subjects / body keywords the staff app is allowed to send. */
    private const ALLOWED_SUBJECT_PREFIXES = [
        'HealthTrack RHU',
        'NOW SERVING',
        'REMINDER',
    ];

    public function email(Request $request)
    {
        $data = $request->validate([
            'to' => 'required|email|max:255',
            'subject' => 'required|string|max:200',
            'text' => 'required|string|max:5000',
            'html' => 'nullable|string|max:10000',
            'logData' => 'nullable|array',
        ]);

        // Disallow client-controlled From (open-relay hardening).
        $from = (string) config('services.resend.from');

        if (!$this->isAllowedSubject($data['subject']) || !$this->isAllowedBody($data['text'])) {
            return response()->json([
                'ok' => false,
                'error' => 'Email content is not an approved RHU notification template.',
            ], 422);
        }

        // Only notify known patients when patient_id is provided; otherwise require staff role (already gated) + template.
        $log = $data['logData'] ?? [];
        if (!empty($log['patientId']) && !$this->patientEmailMatches((string) $log['patientId'], $data['to'])) {
            return response()->json([
                'ok' => false,
                'error' => 'Recipient email does not match the linked patient record.',
            ], 422);
        }

        $apiKey = (string) config('services.resend.key');

        if ($apiKey === '') {
            Log::info('[notify] MOCK email', [
                'to' => $data['to'],
                'subject' => $data['subject'],
            ]);

            $this->writeEmailLog($data, 'sent', 'mock');

            return response()->json(['ok' => true, 'mock' => true]);
        }

        try {
            $safeHtml = '<pre style="font-family:sans-serif;white-space:pre-wrap">'
                .e($data['text']).'</pre>';

            $response = Http::withToken($apiKey)
                ->timeout(30)
                ->post('https://api.resend.com/emails', [
                    'from' => $from,
                    'to' => [$data['to']],
                    'subject' => $data['subject'],
                    'text' => $data['text'],
                    'html' => $safeHtml,
                ]);

            if (!$response->successful()) {
                $this->writeEmailLog($data, 'failed', $response->body());

                return response()->json([
                    'ok' => false,
                    'error' => 'Email provider rejected the request.',
                ], 502);
            }

            $this->writeEmailLog($data, 'sent', $response->body());

            return response()->json(['ok' => true]);
        } catch (\Throwable $e) {
            Log::error('[notify] '.$e->getMessage());
            $this->writeEmailLog($data, 'failed', $e->getMessage());

            return response()->json(['ok' => false, 'error' => 'Failed to send email.'], 500);
        }
    }

    private function isAllowedSubject(string $subject): bool
    {
        foreach (self::ALLOWED_SUBJECT_PREFIXES as $prefix) {
            if (str_starts_with($subject, $prefix)) {
                return true;
            }
        }

        return false;
    }

    private function isAllowedBody(string $text): bool
    {
        // All staff notification helpers end with RHU signature.
        return str_contains($text, 'Rural Health Unit of Pila')
            || str_contains($text, '— Rural Health Unit of Pila');
    }

    private function patientEmailMatches(string $patientId, string $to): bool
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = (string) config('services.supabase.service_role_key');
        if ($url === '' || $serviceKey === '') {
            return true; // cannot verify; rely on template allowlist
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $serviceKey,
                'Authorization' => 'Bearer '.$serviceKey,
            ])->timeout(10)->get("{$url}/rest/v1/patients", [
                'id' => 'eq.'.$patientId,
                'select' => 'email',
            ]);

            if (!$response->successful()) {
                return false;
            }

            $rows = $response->json();
            $email = is_array($rows) && isset($rows[0]['email']) ? strtolower(trim((string) $rows[0]['email'])) : '';

            return $email !== '' && $email === strtolower(trim($to));
        } catch (\Throwable) {
            return false;
        }
    }

    private function writeEmailLog(array $data, string $status, ?string $providerResponse): void
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $serviceKey = (string) config('services.supabase.service_role_key');
        if ($url === '' || $serviceKey === '') {
            return;
        }

        $log = $data['logData'] ?? [];

        try {
            Http::withHeaders([
                'apikey' => $serviceKey,
                'Authorization' => 'Bearer '.$serviceKey,
                'Content-Type' => 'application/json',
                'Prefer' => 'return=minimal',
            ])->post("{$url}/rest/v1/email_logs", [[
                'appointment_id' => $log['appointmentId'] ?? null,
                'queue_id' => $log['queueId'] ?? null,
                'patient_id' => $log['patientId'] ?? null,
                'recipient_email' => $data['to'],
                'message' => $data['text'],
                'status' => $status,
                'provider_response' => $providerResponse ? substr($providerResponse, 0, 2000) : null,
            ]]);
        } catch (\Throwable $e) {
            Log::warning('[notify] email_logs write failed: '.$e->getMessage());
        }
    }
}
