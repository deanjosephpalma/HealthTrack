<?php
/**
 * Dev helper: sample clinical rows from Supabase (patient_records is SoT).
 * Usage: php check_records.php  (from HealthTrackAPI with .env loaded)
 */
require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(\Illuminate\Contracts\Console\Kernel::class)->bootstrap();

$url = env('SUPABASE_URL');
$key = env('SUPABASE_SERVICE_ROLE_KEY');
$client = new \GuzzleHttp\Client();

$res = $client->get("{$url}/rest/v1/patient_records", [
    'headers' => ['apikey' => $key, 'Authorization' => "Bearer {$key}"],
    'query'   => [
        'select' => 'id,diagnosis,prescription,barangay,notes,tb_classification,created_at',
        'order'  => 'created_at.desc',
        'limit'  => '20',
    ],
]);
$records = json_decode($res->getBody(), true);
if (!is_array($records)) {
    echo "Failed to load patient_records\n";
    exit(1);
}

echo '=== patient_records ('.count($records)." recent) ===\n";
foreach ($records as $r) {
    echo 'diagnosis: '.($r['diagnosis'] ?? 'NULL')
       .' | rx: '.substr((string) ($r['prescription'] ?? ''), 0, 40)
       .' | barangay: '.($r['barangay'] ?? 'NULL')
       .' | notes: '.substr((string) ($r['notes'] ?? ''), 0, 50)
       ."\n";
}

$tb = array_values(array_filter($records, static function ($r) {
    $dx = (string) ($r['diagnosis'] ?? '');
    $notes = (string) ($r['notes'] ?? '');

    return !empty($r['tb_classification'])
        || str_contains($notes, '[TB Treatment Record]')
        || preg_match('/tuberculosis|\btb\b/i', $dx);
}));

echo "\n=== TB-like rows in sample (".count($tb).") ===\n";
foreach ($tb as $r) {
    echo 'classification: '.($r['tb_classification'] ?? 'Unclassified')
       .' | diagnosis: '.($r['diagnosis'] ?? 'NULL')
       .' | barangay: '.($r['barangay'] ?? 'NULL')
       ."\n";
}
