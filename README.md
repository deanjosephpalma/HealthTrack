# HealthTrack RHU

HealthTrack is a community health and rural health unit (RHU) system for coordinating patient intake and day-to-day clinic operations. This repository contains the staff application, a separate patient portal, a Laravel API, and Supabase database migrations.

## What the system does

- Lets patients register, manage their profile, request services, join the queue, and view their health records and follow-ups.
- Gives nurses tools for intake and encoding, queue and service desk management, patient records, inventory, follow-ups, and workflow tracking.
- Gives doctors tools for consultation, diagnoses and prescriptions, certificates, reports, and emergency triage.
- Provides queue displays, operational dashboards, and geographic disease heat maps.
- Supports installable progressive web apps and selected offline workflows. Offline data is stored locally in the browser and synchronized features still require connectivity.
- Uses role-based access and database row-level security (RLS) to protect patient and staff data.

HealthTrack supports clinic workflows; it is not a substitute for clinical judgment. Triage rules and clinical settings must be reviewed by qualified RHU staff before use.

## Repository layout

| Directory | Purpose | Main technologies |
| --- | --- | --- |
| `HealthTrackWEB/` | Staff application for doctors and nurses | React, Vite, Tailwind CSS, Supabase JS |
| `HealthTrackPatientSide/` | Patient-facing portal | React, Vite, Tailwind CSS, Supabase JS |
| `HealthTrackAPI/` | Backend-for-frontend (BFF), auth/session, email/SMS and other server-side integrations | Laravel 12, PHP 8.2+, Sanctum |
| `HealthTrackWEB/supabase/` | Base database schema and SQL migrations | Supabase / PostgreSQL |
| `docs/` | Operational and system documentation | Markdown |

Supabase provides PostgreSQL, authentication, realtime features, and access policies. Staff and patient apps are separate frontends; the Laravel API manages portal sessions and server-side integrations. The root npm scripts are convenience shortcuts for the staff app.

## Tech stack

- **Frontend:** React 19, React Router, Vite 8, Tailwind CSS 4
- **Data and authentication:** Supabase PostgreSQL, Supabase Auth, Realtime, Row Level Security
- **Backend:** Laravel 12, PHP 8.2+, Laravel Sanctum
- **Offline and visualizations:** Dexie/IndexedDB, Workbox PWA, Recharts, D3, MapLibre, Leaflet, deck.gl
- **Deployment:** Render configuration is included for the API; frontend deployment can use any static host configured for Vite SPA routing.

## Prerequisites

- Git
- Node.js 20.19+ or 22.12+ (required by Vite 8) and npm
- PHP 8.2+ with the extensions required by Laravel and PostgreSQL (`pdo_pgsql`, `mbstring`, `exif`, `pcntl`, `bcmath`, `gd`); Composer 2
- A Supabase project with access to its URL, public anon/publishable key, database, and project auth settings
- A browser with modern JavaScript support

For frontend-only work, Node/npm and a Supabase project are enough. To use login flows that rely on the BFF, run the Laravel API as well. Optional email, SMS and AI integrations need their respective provider credentials.

## Quick start: staff app

From the repository root:

```bash
npm install
Copy-Item HealthTrackWEB/.env.example HealthTrackWEB/.env
```

Edit `HealthTrackWEB/.env` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for your Supabase project. Then start the frontend:

```bash
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). To build the staff app for deployment:

```bash
npm run build:web
```

This starts only the staff frontend. For end-to-end auth and API-backed features, configure and run the API and patient app as described below.

## Manual setup

### 1. Configure Supabase

1. Create a Supabase project and save its URL, anon/publishable key, service-role key, and JWT secret securely.
2. In the Supabase SQL Editor, apply `HealthTrackWEB/supabase/schema.sql` to a new project.
3. Apply the SQL files in `HealthTrackWEB/supabase/migrations/` in the order required by your current schema. The directory contains incremental feature and security changes, so it is not safe to assume alphabetical order. Review the migration history and `HealthTrackWEB/docs/ops-runbook.md` before applying to an existing project.
4. Configure Auth providers and redirect URLs for the staff and patient domains you will use.
5. Confirm RLS is enabled and the required policies and RPC functions are installed before using real patient data.

Some migrations update existing objects or assume earlier migrations have run. Back up the database and use a staging project when applying migrations to an established deployment. Review clinician-facing defaults in `three_point_triage.sql` with the RHU before enabling them.

### 2. Start the Laravel API

In a separate terminal:

```bash
cd HealthTrackAPI
composer install
Copy-Item .env.example .env
php artisan key:generate
```

Edit `HealthTrackAPI/.env`. Set the Supabase credentials and JWT secret, local `APP_URL`, portal URLs, and allowed origins. The checked-in example uses SQLite for Laravel's own session/application database; configure the database and run Laravel migrations if you change that setup. Start the API:

```bash
php artisan serve
```

The Vite configs proxy `/api` and `/sanctum` to `http://127.0.0.1:8000` for local first-party cookie-based sessions. Configure `SANCTUM_STATEFUL_DOMAINS` and `CORS_ALLOWED_ORIGINS` to include the actual local frontend origins. If using a separate API host, set `VITE_API_URL` on each frontend and configure HTTPS, cookie SameSite/Secure settings, CORS, and trusted domains together.

Optional backend integrations are configured server-side: `RESEND_API_KEY` for email, `SEMAPHORE_API_KEY` for SMS, and `GEMINI_API_KEY` for AI features. Leave them unset when those integrations are not being used.

### 3. Start the staff frontend

In another terminal:

```bash
cd HealthTrackWEB
npm ci
Copy-Item .env.example .env
```

Set the two required Supabase variables in `.env`. `VITE_API_BASE_URL` may be `/api` to use the local Vite proxy (recommended for local Sanctum cookies); otherwise set `VITE_API_URL` to the API base URL. Start it with:

```bash
npm run dev
```

### 4. Start the patient portal

In another terminal:

```bash
cd HealthTrackPatientSide
npm ci
Copy-Item .env.example .env
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the same project. Use `VITE_API_BASE_URL=/api` with the local Vite proxy, or set `VITE_API_URL` to the deployed API base URL. Then:

```bash
npm run dev
```

The Vite config starts on the next available local port (commonly 5174 if the staff app is already using 5173). Add the chosen origin and port to the API's stateful domains and CORS configuration.

## Environment configuration

Each app has a safe template: `HealthTrackWEB/.env.example`, `HealthTrackPatientSide/.env.example`, and `HealthTrackAPI/.env.example`. Copy the relevant file to `.env` and fill in local values.

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Staff and patient frontends | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Staff and patient frontends | Public client key, subject to RLS; never use the service-role key here |
| `VITE_API_BASE_URL` | Staff and patient frontends | Optional API base path; use `/api` with the local Vite proxy |
| `VITE_API_URL` | Staff and patient frontends | API URL fallback or full API base URL |
| `VITE_HEATMAP_API_BASE_URL` | Frontend(s) as used | Optional separate heat map API URL |
| `SUPABASE_URL` | Laravel API | Supabase project URL for server-side requests |
| `SUPABASE_ANON_KEY` | Laravel API | Public Supabase key used by server-side auth flows |
| `SUPABASE_SERVICE_ROLE_KEY` | Laravel API and trusted admin scripts only | Privileged server-side access; keep secret and tightly restricted |
| `SUPABASE_JWT_SECRET` | Laravel API | Validates Supabase JWTs; keep secret |
| `APP_KEY` | Laravel API | Laravel application encryption key, generated with `php artisan key:generate` |
| `APP_URL`, `STAFF_APP_URL`, `PATIENT_APP_URL` | Laravel API | Public API and portal origins used for links and redirects |
| `CORS_ALLOWED_ORIGINS`, `SANCTUM_STATEFUL_DOMAINS` | Laravel API | Allowed frontend origins and cookie-auth domains |
| `SESSION_SECURE_COOKIE`, `SESSION_SAME_SITE`, `SESSION_DOMAIN` | Laravel API | Cookie behavior; use HTTPS and production-appropriate values in deployment |
| `RESEND_API_KEY`, `SEMAPHORE_API_KEY`, `GEMINI_API_KEY` | Laravel API only | Optional email, SMS, and AI providers |

Vite exposes variables prefixed with `VITE_` in the browser bundle. **Never place `SUPABASE_SERVICE_ROLE_KEY`, JWT secrets, email/SMS provider keys, or other private credentials in a frontend `.env` or any `VITE_*` variable.** Do not commit `.env` files.

## Common commands

| Directory | Command | Description |
| --- | --- | --- |
| Repository root | `npm run dev` | Start staff app dev server |
| Repository root | `npm run build:web` | Build staff app |
| Repository root | `npm run lint:web` | Lint staff app |
| `HealthTrackWEB/` | `npm run build` / `npm run lint` | Build or lint staff app |
| `HealthTrackPatientSide/` | `npm run dev` / `npm run build` / `npm run lint` | Run, build, or lint patient portal |
| `HealthTrackAPI/` | `php artisan serve` | Run Laravel API locally |
| `HealthTrackAPI/` | `composer audit` | Check PHP dependencies |

Staff-only account seeding scripts are available in `HealthTrackWEB` (`npm run seed:accounts`, `npm run seed:staff`). Review each script and its required credentials before running it. Data clearing scripts are destructive and intended only for controlled development environments.

## Deployment notes

- Build the staff app from `HealthTrackWEB/` with `npm ci && npm run build`; deploy the `dist/` directory and configure your static host to serve `index.html` for SPA routes.
- Build the patient portal from `HealthTrackPatientSide/` the same way and deploy its `dist/` directory separately.
- Build/deploy the API from `HealthTrackAPI/`. The root `render.yaml` defines a Render Docker service and lists required secrets as unsynchronized values.
- Set frontend build variables in the hosting platform; Vite embeds them at build time. Only public Supabase values belong in frontend variables.
- Use HTTPS, correct CORS/stateful-domain settings, secure cookie configuration, and shared session storage for multi-instance API deployments. Do not use file sessions across multiple API instances.
- Apply schema changes through reviewed migrations and maintain database backups. Do not point seed or cleanup scripts at production unless the operation has been explicitly reviewed.

## Further documentation

- [Staff application notes](HealthTrackWEB/README.md)
- [Operations runbook](HealthTrackWEB/docs/ops-runbook.md)
- [System flowchart](HealthTrackWEB/docs/system-flowchart.md)
- [Heat map API notes](HealthTrackWEB/docs/laravel-heatmap-api.md)
- [Emergency triage migration notes](HealthTrackWEB/supabase/migrations/emergency_triage.README.md)

## Security and privacy

This system handles sensitive health information. Use synthetic data for local development, restrict access to Supabase and deployment secrets, review RLS policies before launch, and follow your organization's privacy, retention, backup, and incident-response requirements. Never commit real patient data, credentials, or database exports.
