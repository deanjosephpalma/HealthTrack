<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\SupabasePasswordAuth;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class AccountAdminController extends Controller
{
    private const LOCAL_VAULT = 'account_password_vault.json';

    public function __construct(private SupabasePasswordAuth $supabaseAuth)
    {
    }

    public function index(Request $request)
    {
        if (!$this->isAccountManager($request)) {
            return response()->json(['ok' => false, 'error' => 'Forbidden'], 403);
        }

        $profiles = $this->fetchProfiles();
        $patients = $this->fetchPatients();
        $vault = array_merge($this->fetchRemotePasswordVault(), $this->fetchLocalPasswordVault());

        $staff = array_map(function (array $row) use ($vault) {
            $userId = (string) ($row['id'] ?? '');

            return [
                'user_id' => $userId,
                'account_type' => 'staff',
                'role' => (string) ($row['role'] ?? ''),
                'name' => (string) ($row['name'] ?? ''),
                'email' => (string) ($row['email'] ?? ''),
                'username' => null,
                'phone' => null,
                'password' => $vault[$userId] ?? 'rhupila',
            ];
        }, $profiles);

        $patientAccounts = array_map(function (array $row) use ($vault) {
            $userId = (string) ($row['patient_auth_id'] ?? '');

            return [
                'user_id' => $userId,
                'account_type' => 'patient',
                'role' => 'Patient',
                'name' => trim((string) ($row['name'] ?? '')) ?: trim(((string) ($row['first_name'] ?? '')).' '.((string) ($row['last_name'] ?? ''))),
                'email' => (string) ($row['email'] ?? ''),
                'username' => (string) ($row['portal_username'] ?? ''),
                'phone' => (string) (($row['mobile_phone'] ?? '') ?: ($row['phone'] ?? '')),
                'password' => $vault[$userId] ?? '',
            ];
        }, $patients);

        $accounts = array_values(array_filter(array_merge($staff, $patientAccounts), fn ($a) => !empty($a['user_id'])));

        usort($accounts, function ($a, $b) {
            $typeCmp = strcmp($a['account_type'], $b['account_type']);
            if ($typeCmp !== 0) {
                return $typeCmp;
            }

            return strcmp(strtolower($a['name'] ?: $a['email']), strtolower($b['name'] ?: $b['email']));
        });

        return response()->json([
            'ok' => true,
            'accounts' => $accounts,
        ]);
    }

    public function resetPassword(Request $request)
    {
        if (!$this->isAccountManager($request)) {
            return response()->json(['ok' => false, 'error' => 'Forbidden'], 403);
        }

        $data = $request->validate([
            'user_id' => 'required|uuid',
            'new_password' => 'required|string|min:6|max:255',
        ]);

        $userId = (string) $data['user_id'];
        $password = (string) $data['new_password'];

        $patient = collect($this->fetchPatients())->first(
            fn (array $row) => (string) ($row['patient_auth_id'] ?? '') === $userId
        );
        if (is_array($patient) && !empty($patient['portal_username'])) {
            $expectedEmail = \App\Http\Controllers\Api\PatientRegisterController::authEmailFromUsername(
                (string) $patient['portal_username']
            );
            $identityUpdated = $this->supabaseAuth->adminUpdatePatientIdentity($userId, [
                'email' => $expectedEmail,
                'email_confirm' => true,
            ]);
            if (!$identityUpdated) {
                return response()->json([
                    'ok' => false,
                    'error' => 'Could not sync the patient login identity. Please try again.',
                ], 500);
            }
        }

        $ok = $this->supabaseAuth->adminUpdatePassword($userId, $password);
        if (!$ok) {
            return response()->json(['ok' => false, 'error' => 'Could not reset password. Please try again.'], 500);
        }

        self::upsertPasswordVault($userId, $password);

        return response()->json(['ok' => true, 'message' => 'Password reset successful.', 'password' => $password]);
    }

    public static function upsertPasswordVault(string $userId, string $password): bool
    {
        if ($userId === '' || $password === '') {
            return false;
        }

        $localOk = self::upsertLocalPasswordVault($userId, $password);
        $remoteOk = self::upsertRemotePasswordVault($userId, $password);

        return $localOk || $remoteOk;
    }

    private static function upsertLocalPasswordVault(string $userId, string $password): bool
    {
        try {
            $map = [];
            if (Storage::disk('local')->exists(self::LOCAL_VAULT)) {
                $decoded = json_decode(Storage::disk('local')->get(self::LOCAL_VAULT), true);
                if (is_array($decoded)) {
                    $map = $decoded;
                }
            }
            $map[$userId] = $password;
            Storage::disk('local')->put(self::LOCAL_VAULT, json_encode($map, JSON_PRETTY_PRINT));

            return true;
        } catch (\Throwable $e) {
            Log::warning('[account-vault] local upsert failed: '.$e->getMessage());

            return false;
        }
    }

    private static function upsertRemotePasswordVault(string $userId, string $password): bool
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
                'Prefer' => 'resolution=merge-duplicates',
            ])->timeout(15)->post("{$url}/rest/v1/account_password_vault", [
                [
                    'user_id' => $userId,
                    'password_plain' => $password,
                    'updated_at' => now()->toIso8601String(),
                ],
            ]);

            if (!$response->successful()) {
                Log::warning('[account-vault] remote upsert failed: '.$response->body());

                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::warning('[account-vault] remote upsert exception: '.$e->getMessage());

            return false;
        }
    }

    /** @return array<string, string> */
    private function fetchLocalPasswordVault(): array
    {
        try {
            if (!Storage::disk('local')->exists(self::LOCAL_VAULT)) {
                return [];
            }
            $decoded = json_decode(Storage::disk('local')->get(self::LOCAL_VAULT), true);

            return is_array($decoded) ? $decoded : [];
        } catch (\Throwable) {
            return [];
        }
    }

    /** @return array<string, string> */
    private function fetchRemotePasswordVault(): array
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $key = (string) config('services.supabase.service_role_key');
        if ($url === '' || $key === '') {
            return [];
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $key,
                'Authorization' => 'Bearer '.$key,
            ])->timeout(20)->get("{$url}/rest/v1/account_password_vault", [
                'select' => 'user_id,password_plain',
                'limit' => 5000,
            ]);

            if (!$response->successful()) {
                return [];
            }

            $rows = $response->json();
            if (!is_array($rows)) {
                return [];
            }

            $map = [];
            foreach ($rows as $row) {
                if (!is_array($row) || empty($row['user_id'])) {
                    continue;
                }
                $map[(string) $row['user_id']] = (string) ($row['password_plain'] ?? '');
            }

            return $map;
        } catch (\Throwable) {
            return [];
        }
    }

    /** @return array<int, array<string, mixed>> */
    private function fetchProfiles(): array
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $key = (string) config('services.supabase.service_role_key');
        if ($url === '' || $key === '') {
            return [];
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $key,
                'Authorization' => 'Bearer '.$key,
            ])->timeout(20)->get("{$url}/rest/v1/profiles", [
                'select' => 'id,name,email,role',
                'order' => 'name.asc',
                'limit' => 1000,
            ]);

            if (!$response->successful()) {
                return [];
            }

            $rows = $response->json();
            if (!is_array($rows)) {
                return [];
            }

            return array_values(array_filter($rows, function ($row) {
                return is_array($row) && in_array((string) ($row['role'] ?? ''), ['Admin', 'Doctor', 'Nurse', 'BHW', 'Volunteer'], true);
            }));
        } catch (\Throwable) {
            return [];
        }
    }

    /** @return array<int, array<string, mixed>> */
    private function fetchPatients(): array
    {
        $url = rtrim((string) config('services.supabase.url'), '/');
        $key = (string) config('services.supabase.service_role_key');
        if ($url === '' || $key === '') {
            return [];
        }

        try {
            $response = Http::withHeaders([
                'apikey' => $key,
                'Authorization' => 'Bearer '.$key,
            ])->timeout(20)->get("{$url}/rest/v1/patients", [
                'select' => 'patient_auth_id,name,first_name,last_name,email,phone,mobile_phone,portal_username',
                'order' => 'name.asc',
                'limit' => 2000,
            ]);

            if (!$response->successful()) {
                return [];
            }

            $rows = $response->json();
            if (!is_array($rows)) {
                return [];
            }

            return array_values(array_filter($rows, fn ($row) => is_array($row) && !empty($row['patient_auth_id'])));
        } catch (\Throwable) {
            return [];
        }
    }

    private function isAccountManager(Request $request): bool
    {
        $auth = $request->attributes->get('ht_auth');
        if (!is_array($auth)) {
            return false;
        }

        $name = strtolower(trim((string) ($auth['name'] ?? '')));
        $email = strtolower(trim((string) ($auth['email'] ?? '')));
        $allowedName = strtolower(trim((string) config('services.accounts.manager_name', 'Alma Divinagracia')));
        $allowedEmail = strtolower(trim((string) config('services.accounts.manager_email', '')));

        if ($allowedName !== '' && $name !== '' && $name === $allowedName) {
            return true;
        }

        if ($allowedEmail !== '' && $email !== '' && $email === $allowedEmail) {
            return true;
        }

        return false;
    }
}
