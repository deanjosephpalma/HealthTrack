# HealthTrack RHU — Ops Runbook

Stack: **Supabase PostgreSQL** (source of truth) + **Laravel API** (Sanctum BFF, notify, AI, heatmap RPC) + **HealthTrackWEB** (Doctor/Nurse) + **HealthTrackPatientSide** (Patient).

## Roles (product)

- Doctor, Nurse, Patient only — no Admin UI.
- Staff accounts: seed via `HealthTrackWEB` → `npm run seed:accounts` (uses service role).

## Environments & secrets

| App | Required env |
|-----|----------------|
| WEB / Patient | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL=/api` |
| API | `SUPABASE_*` (url, anon, service_role, jwt_secret), Sanctum/session, Resend/Gemini server-side only |

Never commit `.env`. Prefer same-origin Vite → `/api` proxy so Sanctum cookies stay first-party.

## Schema apply order (Supabase SQL Editor)

Apply when missing, in order:

1. Base schema / prior feature migrations as needed  
2. `security_hardening_rls.sql`  
3. `phase1_critical_fixes.sql`  
4. `phase2_security_fixes.sql`  
5. `phase3_performance.sql`  
6. `phase4_polish.sql`  

Confirm RPCs: `heatmap_pila_disease_counts`, `next_queue_number`, `verify_pending_code`.

## Clinical data strategy

- **Source of truth:** `patient_records` (plus `patients` demographics).
- **OP / TB / Animal Bite:** tagged `notes` + shared columns (e.g. `tb_classification`); schedules on `animal_bite_doses` / `tb_monitoring`.
- **Prescriptions:** free-text `patient_records.prescription` (Doctor Consult / patient Medical Records). Not a pharmacy dispense module.

## Local run

```bash
# API
cd HealthTrackAPI && php artisan serve

# Staff UI
cd HealthTrackWEB && npm run dev

# Patient UI
cd HealthTrackPatientSide && npm run dev
```

Production sessions: `SESSION_DRIVER=redis` (preferred) or `database` — not `file` on multi-instance.

## Backup drill (monthly)

1. Supabase: verify PITR / download logical export for staging.  
2. Restore sample project or staging DB.  
3. Spot-check: auth user login, one `patients` row, one `patient_records` row, today’s `queue`.  
4. Laravel: back up `storage/` if local files are used; sessions in Redis/DB need their own backup.  
5. Record date, operator, and result in your change log.

## Dependency audit cadence (quarterly)

```bash
cd HealthTrackWEB && npm audit
cd HealthTrackPatientSide && npm audit
cd HealthTrackAPI && composer audit
```

Fix High/Critical before production cut. Re-run after major upgrades.

Package scripts: `npm run audit:deps` in WEB and Patient; `composer audit` in API.

## Smoke checklist (release)

- [ ] Staff login (Doctor + Nurse) + hard refresh restores session  
- [ ] Patient login + profile save  
- [ ] Queue join → Nurse desk / Doctor consult → patient Medical Records shows diagnosis + prescription  
- [ ] Nurse encode with “send to doctor” keeps intake notes (AB/TB tags) on `patient_records`  
- [ ] Follow-ups (AB/TB schedules)  
- [ ] Heat Map loads; optional `GET /api/heatmap/pila-diseases` returns aggregates  
- [ ] Two staff users on one browser: logout/login does not leak offline PHI  
- [ ] `npm run build` succeeds for WEB + PatientSide; API PHP controllers lint clean  

## Incident hints

- Rotate Supabase anon/service keys and Resend/Gemini keys if leaked.  
- Check `audit_logs` for unexpected deletes/updates.  
- Failed migration: do not force unique indexes until duplicates are resolved (see phase3 dedupe).  
- Auth cookie issues: confirm `X-HealthTrack-Portal`, CSRF `XSRF-TOKEN`, and `SANCTUM_STATEFUL_DOMAINS`.
