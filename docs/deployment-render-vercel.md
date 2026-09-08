# HealthTrack deployment

This workspace is prepared for:

- Laravel API on Render using `render.yaml`
- `HealthTrackPatientSide` on Vercel
- `HealthTrackWEB` on Vercel

## 1. Push the repository

Review the local changes, then commit and push the repository to GitHub. Render and Vercel deploy from GitHub; they do not see uncommitted local files.

## 2. Deploy the API on Render

1. Open Render and choose **New > Blueprint**.
2. Select the `HealthTrack` GitHub repository.
3. Render detects `render.yaml` and creates `healthtrack-api`.
4. Add the secret environment variables marked `sync: false`.
5. Use the generated API URL as `APP_URL`.
6. Deploy and verify `https://<api-host>/up` returns a healthy response.

Required API values:

- `APP_KEY` from Laravel
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `CORS_ALLOWED_ORIGINS` (add both Vercel URLs, comma-separated)
- `SANCTUM_STATEFUL_DOMAINS` (add both frontend hosts, comma-separated)

Do not commit `.env` or any secret values.

## 3. Deploy Patient UI on Vercel

Create a Vercel project from the same repository with:

- Root Directory: `HealthTrackPatientSide`
- Build Command: `npm run build`
- Output Directory: `dist`

Add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL=https://<api-host>`

## 4. Deploy Staff UI on Vercel

Create another Vercel project from the same repository with:

- Root Directory: `HealthTrackWEB`
- Build Command: `npm run build`
- Output Directory: `dist`

Add:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL=https://<api-host>`
- `VITE_ACCOUNT_MANAGER_NAME`
- `VITE_ACCOUNT_MANAGER_EMAIL`

After both Vercel URLs exist, update Render's `CORS_ALLOWED_ORIGINS` and `SANCTUM_STATEFUL_DOMAINS`, then redeploy the API.

## 5. Smoke test

- API `/up` responds successfully.
- Staff login works after a hard refresh.
- Patient registration/login works.
- Patient queue and document upload work.
- Staff can see the queue and encode a record.
- Sign out/in as a different patient does not show the previous patient's local data.

## Security

Rotate any Supabase service-role key and mail credentials that were exposed during development before making the public deployment.
