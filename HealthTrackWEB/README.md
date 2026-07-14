# HealthTrack WEB (Staff)

Doctor / Nurse RHU dashboard: queueing, consult, nurse service desk, patient records, follow-ups, heat map, workflow, inventory, archive.

Patient portal is a separate app: `HealthTrackPatientSide`.  
API BFF: `HealthTrackAPI` (Sanctum cookies + Supabase JWT bootstrap).

## Roles

- **Doctor** — consult, diagnosis/prescription, medical certificate, heat map, reports  
- **Nurse** — queue, service desk, encode, inventory, workflow, archive  
- **Patient** — use PatientSide only (no Admin role in product)

## Quick start

1. Copy `.env.example` → `.env` (Supabase URL/anon + `VITE_API_BASE_URL=/api`).  
2. Run Laravel API with matching Supabase JWT secret.  
3. `npm install` && `npm run dev`  
4. Apply Supabase migrations (see `docs/ops-runbook.md`).  
5. `npm run seed:accounts` (requires service role in seed env).

## Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run seed:accounts` | Seed Doctor/Nurse accounts |
| `npm run clear:patient-data` | Dev wipe helper |
| `npm run audit:deps` | `npm audit` for dependency cadence |

## Docs

- [Ops runbook](docs/ops-runbook.md) — backups, audits, smoke checks  
- [Heat map API](docs/laravel-heatmap-api.md) — Laravel aggregate endpoint  

## Architecture notes

- Auth: HttpOnly Sanctum portal cookies; Supabase access JWT in memory only.  
- Offline: Dexie IndexedDB, wiped/namespaced per user on login.  
- Clinical SoT: `patient_records` (OP/TB/AB encoded there; prescription free-text column).
