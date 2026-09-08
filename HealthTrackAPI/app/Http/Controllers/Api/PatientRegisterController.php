<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PatientSmsService;
use App\Services\SupabasePasswordAuth;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class PatientRegisterController extends Controller
{
    public const AUTH_EMAIL_DOMAIN = 'patient.healthtrack.local';

    /** Official Pila barangays (same set as heat map / profile). */
    public const PILA_BARANGAYS = [
        'Aplaya',
        'Bagong Pook',
        'Bukal',
        'Bulilan Norte',
        'Bulilan Sur',
        'Concepcion',
        'Labuin',
        'Linga',
        'Masico',
        'Mojon',
        'Pansol',
        'Pinagbayanan',
        'San Antonio',
        'San Miguel',
        'Santa Clara Norte',
        'Santa Clara Sur',
        'Tubuan',
    ];

    public function __construct(
        private SupabasePasswordAuth $supabaseAuth,
        private PatientSmsService $sms,
    ) {
    }

    /**
     * GET /api/geo/patient-address
     * Cascading address options: Laguna fixed; municipality Pila | Others.
     */
    public function addressOptions()
    {
        return response()->json([
            'ok' => true,
            'province' => 'Laguna',
            'municipalities' => [
                ['value' => 'Pila', 'label' => 'Pila'],
                ['value' => 'Others', 'label' => 'Others (not from Pila)'],
            ],
            'pila_barangays' => array_map(
                fn ($name) => ['value' => $name, 'label' => $name],
                self::PILA_BARANGAYS
            ),
        ]);
    }

    /**
     * POST /api/auth/patient-register
     * Phone-first registration → auto username (0001…) + SMS.
     */
    public function register(Request $request)
    {
        if (!$this->sms->isConfigured() && $this->sms->isRequired()) {
            return response()->json([
                'ok' => false,
                'error' => 'SMS is temporarily unavailable. Contact RHU to configure SMS provider first.',
            ], 503);
        }

        $data = $request->validate([
            'first_name' => 'required|string|max:80',
            'last_name' => 'required|string|max:80',
            'phone' => ['required', 'string', 'max:20', 'regex:/^(09\d{9}|\+639\d{9})$/'],
            'password' => 'required|string|min:6|max:255|confirmed',
            'birthdate' => 'required|date|before_or_equal:today',
            'disability' => 'nullable|string|max:255',
            'house_no_purok' => 'required|string|max:255',
            'municipality_mode' => ['required', Rule::in(['Pila', 'Others'])],
            'municipality' => 'nullable|string|max:120',
            'barangay' => 'required|string|max:120',
            'province' => 'nullable|string|max:80',
        ]);

        $phone = $this->normalizePhone($data['phone']);
        $firstName = trim($data['first_name']);
        $lastName = trim($data['last_name']);
        $fullName = trim("{$firstName} {$lastName}");

        if ($data['municipality_mode'] === 'Pila') {
            if (!in_array($data['barangay'], self::PILA_BARANGAYS, true)) {
                return response()->json(['ok' => false, 'error' => 'Please select a valid Pila barangay.'], 422);
            }
            $municipality = 'Pila';
            $barangay = $data['barangay'];
        } else {
            $municipality = trim((string) ($data['municipality'] ?? ''));
            if ($municipality === '' || strcasecmp($municipality, 'Pila') === 0) {
                return response()->json([
                    'ok' => false,
                    'error' => 'Enter your municipality/city when choosing Others.',
                ], 422);
            }
            $barangay = trim($data['barangay']);
        }

        $province = 'Laguna';

        if ($this->phoneAlreadyRegistered($phone)) {
            return response()->json([
                'ok' => false,
                'error' => 'This phone number is already registered.',
            ], 422);
        }

        if ($this->nameAlreadyRegistered($fullName)) {
            return response()->json([
                'ok' => false,
                'error' => 'This name is already registered. Please contact the RHU if you need help accessing your account.',
            ], 422);
        }

        // Temporary auth email; rewritten to {username}@… after patient_number is known.
        $tempToken = bin2hex(random_bytes(8));
        $tempEmail = 'pending.'.$tempToken.'@'.self::AUTH_EMAIL_DOMAIN;

        $userId = $this->supabaseAuth->adminCreatePatientUser([
            'email' => $tempEmail,
            'password' => $data['password'],
            'user_metadata' => [
                'app' => 'patient',
                'auth_mode' => 'phone_username',
                'first_name' => $firstName,
                'last_name' => $lastName,
                'phone' => $phone,
                'email_verified' => true,
                'birthdate' => $data['birthdate'],
                'disability' => $data['disability'] ?? null,
            ],
        ]);

        if (!$userId) {
            return response()->json([
                'ok' => false,
                'error' => 'Failed to create account. Please try again.',
            ], 500);
        }

        AccountAdminController::upsertPasswordVault($userId, (string) $data['password']);

        // Auth trigger creates patients row with patient_number; read it for username 0001…
        $patientNumber = $this->fetchPatientNumber($userId);
        if (!$patientNumber) {
            // Fallback allocate if trigger did not assign yet
            $allocated = $this->allocateUsername();
            $patientNumber = $allocated ? (int) $allocated['out_patient_number'] : null;
        }
        if (!$patientNumber) {
            return response()->json([
                'ok' => false,
                'error' => 'Account created but username could not be assigned. Contact RHU staff.',
            ], 500);
        }

        $username = str_pad((string) $patientNumber, max(4, strlen((string) $patientNumber)), '0', STR_PAD_LEFT);
        $authEmail = $username.'@'.self::AUTH_EMAIL_DOMAIN;

        $this->supabaseAuth->adminUpdatePatientIdentity($userId, [
            'email' => $authEmail,
            'email_confirm' => true,
            'user_metadata' => [
                'app' => 'patient',
                'auth_mode' => 'phone_username',
                'portal_username' => $username,
                'first_name' => $firstName,
                'last_name' => $lastName,
                'phone' => $phone,
                'email_verified' => true,
                'birthdate' => $data['birthdate'],
                'disability' => $data['disability'] ?? null,
            ],
        ]);

        $profileOk = $this->upsertPatientProfile([
            'patient_auth_id' => $userId,
            'patient_number' => $patientNumber,
            'portal_username' => $username,
            'name' => $fullName,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'phone' => $phone,
            'mobile_phone' => $phone,
            'email' => $authEmail,
            'birthdate' => $data['birthdate'],
            'disability' => $data['disability'] ?? null,
            'house_no_purok' => trim($data['house_no_purok']),
            'barangay' => $barangay,
            'municipality' => $municipality,
            'province' => $province,
        ]);

        if (!$profileOk) {
            Log::warning('[patient-register] profile upsert failed', ['user_id' => $userId, 'username' => $username]);
        }

        $this->upsertPatientContact([
            'id' => $userId,
            'email' => $authEmail,
            'phone' => $phone,
            'first_name' => $firstName,
            'last_name' => $lastName,
        ]);

        $smsMessage = "HealthTrack RHU Pila: Your patient username is {$username}. Use it with your password to sign in. Do not share this message.";
        $smsResult = $this->sms->send($phone, $smsMessage);

        return response()->json([
            'ok' => true,
            'username' => $username,
            'patient_number' => $patientNumber,
            'phone' => $phone,
            'sms_sent' => (bool) ($smsResult['ok'] ?? false),
            'sms_mocked' => (bool) ($smsResult['mocked'] ?? false),
            'message' => (($smsResult['ok'] ?? false) && !($smsResult['mocked'] ?? false))
                ? "Account created. We texted your username ({$username}) to your phone."
                : (($smsResult['ok'] ?? false)
                    ? "Account created. Local fallback is active. Your username is {$username}."
                    : "Account created. Your username is {$username}. SMS could not be sent — please save this username."),
        ], 201);
    }

    public static function authEmailFromUsername(string $username): string
    {
        $digits = preg_replace('/\D+/', '', $username) ?? '';
        if ($digits === '') {
            return trim($username).'@'.self::AUTH_EMAIL_DOMAIN;
        }
        $n = (int) $digits;
        $padded = str_pad((string) $n, max(4, strlen((string) $n)), '0', STR_PAD_LEFT);

        return $padded.'@'.self::AUTH_EMAIL_DOMAIN;
    }

    private function normalizePhone(string $phone): string
    {
        $raw = preg_replace('/\s+/', '', $phone) ?? '';
        if (preg_match('/^09\d{9}$/', $raw)) {
            return '+63'.substr($raw, 1);
        }

        return $raw;
    }

    private function phoneAlreadyRegistered(string $phoneE164): bool
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $key = (string) config('services.supabase.service_role_key');
        if ($url === '' || $key === '') {
            return false;
        }

        $local09 = '0'.substr($phoneE164, 3);

        try {
            foreach ([$phoneE164, $local09] as $candidate) {
                foreach (['phone', 'mobile_phone'] as $col) {
                    $response = Http::withHeaders([
                        'apikey' => $key,
                        'Authorization' => 'Bearer '.$key,
                    ])->timeout(15)->get("{$url}/rest/v1/patients", [
                        $col => 'eq.'.$candidate,
                        'select' => 'id',
                        'limit' => 1,
                    ]);
                    if ($response->successful() && is_array($response->json()) && count($response->json()) > 0) {
                        return true;
                    }
                }

                $contacts = Http::withHeaders([
                    'apikey' => $key,
                    'Authorization' => 'Bearer '.$key,
                ])->timeout(15)->get("{$url}/rest/v1/patient_contacts", [
                    'phone' => 'eq.'.$candidate,
                    'select' => 'id',
                    'limit' => 1,
                ]);
                if ($contacts->successful() && is_array($contacts->json()) && count($contacts->json()) > 0) {
                    return true;
                }
            }
        } catch (\Throwable $e) {
            Log::warning('[patient-register] phone check failed: '.$e->getMessage());
        }

        return false;
    }

    private function nameAlreadyRegistered(string $fullName): bool
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $key = (string) config('services.supabase.service_role_key');
        if ($url === '' || $key === '' || trim($fullName) === '') {
            return false;
        }

        $headers = [
            'apikey' => $key,
            'Authorization' => 'Bearer '.$key,
            'Content-Type' => 'application/json',
        ];

        try {
            $rpc = Http::withHeaders($headers)
                ->timeout(15)
                ->post("{$url}/rest/v1/rpc/is_name_registered", ['p_name' => $fullName]);

            if ($rpc->successful()) {
                return $rpc->json() === true;
            }

            Log::warning('[patient-register] name RPC check failed, using direct lookup', [
                'status' => $rpc->status(),
            ]);

            $normalizedName = trim($fullName);
            foreach (['patients' => 'name', 'profiles' => 'name'] as $table => $column) {
                $response = Http::withHeaders($headers)->timeout(15)->get("{$url}/rest/v1/{$table}", [
                    $column => 'ilike.'.$normalizedName,
                    'select' => 'id',
                    'limit' => 1,
                ]);
                if ($response->successful() && is_array($response->json()) && count($response->json()) > 0) {
                    return true;
                }
            }

            $parts = preg_split('/\s+/', $normalizedName, 2);
            if (is_array($parts) && count($parts) === 2) {
                $contacts = Http::withHeaders($headers)->timeout(15)->get("{$url}/rest/v1/patient_contacts", [
                    'first_name' => 'ilike.'.$parts[0],
                    'last_name' => 'ilike.'.$parts[1],
                    'select' => 'id',
                    'limit' => 1,
                ]);
                if ($contacts->successful() && is_array($contacts->json()) && count($contacts->json()) > 0) {
                    return true;
                }
            }
        } catch (\Throwable $e) {
            Log::warning('[patient-register] name check failed: '.$e->getMessage());
        }

        return false;
    }

    private function fetchPatientNumber(string $userId): ?int
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $key = (string) config('services.supabase.service_role_key');
        if ($url === '' || $key === '' || $userId === '') {
            return null;
        }

        try {
            // Trigger may be slightly delayed
            for ($i = 0; $i < 5; $i++) {
                $response = Http::withHeaders([
                    'apikey' => $key,
                    'Authorization' => 'Bearer '.$key,
                ])->timeout(15)->get("{$url}/rest/v1/patients", [
                    'patient_auth_id' => 'eq.'.$userId,
                    'select' => 'patient_number',
                    'limit' => 1,
                ]);
                if ($response->successful()) {
                    $rows = $response->json();
                    if (is_array($rows) && isset($rows[0]['patient_number'])) {
                        return (int) $rows[0]['patient_number'];
                    }
                }
                usleep(200000);
            }
        } catch (\Throwable $e) {
            Log::warning('[patient-register] fetchPatientNumber: '.$e->getMessage());
        }

        return null;
    }

    /**
     * @return array{out_patient_number: int, out_portal_username: string}|null
     */
    private function allocateUsername(): ?array
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $key = (string) config('services.supabase.service_role_key');
        if ($url === '' || $key === '') {
            return null;
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $key,
                'Authorization' => 'Bearer '.$key,
                'Content-Type' => 'application/json',
            ])->timeout(15)->withBody('{}', 'application/json')->post("{$url}/rest/v1/rpc/allocate_patient_username");

            if (!$response->successful()) {
                Log::warning('[patient-register] allocate_patient_username failed: '.$response->body());

                return null;
            }

            $json = $response->json();
            $row = is_array($json) && isset($json[0]) ? $json[0] : (is_array($json) ? $json : null);
            if (!is_array($row) || empty($row['out_portal_username'])) {
                return null;
            }

            return [
                'out_patient_number' => (int) ($row['out_patient_number'] ?? 0),
                'out_portal_username' => (string) $row['out_portal_username'],
            ];
        } catch (\Throwable $e) {
            Log::warning('[patient-register] allocate exception: '.$e->getMessage());

            return null;
        }
    }

    private function upsertPatientProfile(array $payload): bool
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $key = (string) config('services.supabase.service_role_key');
        if ($url === '' || $key === '') {
            return false;
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $key,
                'Authorization' => 'Bearer '.$key,
                'Content-Type' => 'application/json',
                'Prefer' => 'resolution=merge-duplicates,return=minimal',
            ])->timeout(20)->post("{$url}/rest/v1/patients?on_conflict=patient_auth_id", [$payload]);

            if ($response->successful()) {
                return true;
            }

            // Fallback: update by patient_auth_id or insert
            $existing = Http::withHeaders([
                'apikey' => $key,
                'Authorization' => 'Bearer '.$key,
            ])->timeout(15)->get("{$url}/rest/v1/patients", [
                'patient_auth_id' => 'eq.'.$payload['patient_auth_id'],
                'select' => 'id',
                'limit' => 1,
            ]);

            $rows = $existing->successful() ? $existing->json() : [];
            if (is_array($rows) && isset($rows[0]['id'])) {
                $upd = Http::withHeaders([
                    'apikey' => $key,
                    'Authorization' => 'Bearer '.$key,
                    'Content-Type' => 'application/json',
                ])->timeout(20)->patch(
                    "{$url}/rest/v1/patients?id=eq.".$rows[0]['id'],
                    $payload
                );

                return $upd->successful();
            }

            $ins = Http::withHeaders([
                'apikey' => $key,
                'Authorization' => 'Bearer '.$key,
                'Content-Type' => 'application/json',
                'Prefer' => 'return=minimal',
            ])->timeout(20)->post("{$url}/rest/v1/patients", [$payload]);

            return $ins->successful();
        } catch (\Throwable $e) {
            Log::warning('[patient-register] upsertPatientProfile: '.$e->getMessage());

            return false;
        }
    }

    private function upsertPatientContact(array $payload): void
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $key = (string) config('services.supabase.service_role_key');
        if ($url === '' || $key === '') {
            return;
        }

        try {
            Http::withHeaders([
                'apikey' => $key,
                'Authorization' => 'Bearer '.$key,
                'Content-Type' => 'application/json',
                'Prefer' => 'resolution=merge-duplicates,return=minimal',
            ])->timeout(15)->post("{$url}/rest/v1/patient_contacts?on_conflict=id", [[
                ...$payload,
                'updated_at' => now()->toIso8601String(),
            ]]);
        } catch (\Throwable $e) {
            Log::warning('[patient-register] contact upsert: '.$e->getMessage());
        }
    }
}
