<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PatientSmsService
{
    public function isConfigured(): bool
    {
        return trim((string) config('services.semaphore.key')) !== '';
    }

    public function isRequired(): bool
    {
        return (bool) config('services.semaphore.required', false);
    }

    /**
     * Send an SMS to a PH mobile number.
     *
     * @return array{ok: bool, mocked?: bool, error?: string, providerResponse?: string}
     */
    public function send(string $phoneE164, string $message): array
    {
        $to = $this->toSemaphoreNumber($phoneE164);
        $apiKey = trim((string) config('services.semaphore.key'));
        $sender = trim((string) config('services.semaphore.sender', 'HealthTrack'));

        if ($apiKey === '') {
            if (!$this->isRequired()) {
                Log::info('[sms] local fallback (no SEMAPHORE_API_KEY)', [
                    'to' => $to,
                    'message' => $message,
                ]);
                return [
                    'ok' => true,
                    'mocked' => true,
                    'providerResponse' => 'local-fallback',
                ];
            }
            return [
                'ok' => false,
                'error' => 'SEMAPHORE_API_KEY is not configured.',
            ];
        }

        try {
            $response = Http::asForm()->timeout(20)->post('https://api.semaphore.co/api/v4/messages', [
                'apikey' => $apiKey,
                'number' => $to,
                'message' => $message,
                'sendername' => $sender !== '' ? $sender : 'HealthTrack',
            ]);

            if (!$response->successful()) {
                Log::warning('[sms] semaphore failed: '.$response->body());

                return [
                    'ok' => false,
                    'error' => 'SMS provider rejected the message.',
                    'providerResponse' => (string) $response->body(),
                ];
            }

            return [
                'ok' => true,
                'mocked' => false,
                'providerResponse' => (string) $response->body(),
            ];
        } catch (\Throwable $e) {
            Log::warning('[sms] send exception: '.$e->getMessage());

            return ['ok' => false, 'error' => 'Failed to send SMS.'];
        }
    }

    /** Semaphore expects 09xxxxxxxxx or 639xxxxxxxxx */
    private function toSemaphoreNumber(string $phone): string
    {
        $raw = preg_replace('/\s+/', '', $phone) ?? '';
        if (str_starts_with($raw, '+63')) {
            return '0'.substr($raw, 3);
        }
        if (str_starts_with($raw, '63') && strlen($raw) === 12) {
            return '0'.substr($raw, 2);
        }

        return $raw;
    }
}
