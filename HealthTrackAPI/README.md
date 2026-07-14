# HealthTrackAPI

Laravel 12 BFF for HealthTrack RHU: Sanctum SPA cookies, Supabase password grant, notify/AI/heatmap proxies.

See staff docs: `../HealthTrackWEB/docs/ops-runbook.md`

## Key endpoints

- `POST /api/auth/login|refresh|logout`, `GET /api/auth/me`
- Staff: `/api/heatmap/pila-diseases`, `/api/ai/*`, `/api/notify/email`
- Patient: verification send/verify

## Multi-instance

Use `SESSION_DRIVER=redis` or `database` (see `.env.example`). File sessions will not share across hosts.

## Audit

```bash
composer audit
# or
composer run audit
```
