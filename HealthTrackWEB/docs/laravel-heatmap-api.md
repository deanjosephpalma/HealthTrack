# Laravel Heat Map API Contract

This file describes the backend endpoint used by tooling / optional consumers.
The staff Command Center UI reads Supabase directly (projected columns + limits).
The Laravel endpoint aggregates via Supabase RPC `heatmap_pila_disease_counts`
(requires `phase3_performance.sql`).

## Endpoint

`GET /api/heatmap/pila-diseases`

Auth: staff Sanctum session (`X-HealthTrack-Portal: staff`).

## Query Parameters

- `disease` optional filter, e.g. `Tuberculosis`
- `barangay` optional filter, e.g. `Linga`

## Geographic Rule

Only Pila, Laguna residence data (`municipality` is null / Pila / n/a).
Uses `patient_records.diagnosis` (not a `disease_diagnosis` column).

## Expected JSON Response

```json
[
  {
    "barangay": "Linga",
    "disease": "Tuberculosis",
    "count": 12,
    "lat": 14.327,
    "lng": 121.482
  }
]
```

On configuration / SQL miss: HTTP 503 with `{ "ok": false, "error": "..." }`
(no longer a silent empty array from local SQLite).
