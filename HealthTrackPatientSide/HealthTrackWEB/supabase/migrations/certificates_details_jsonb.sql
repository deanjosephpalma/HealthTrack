-- Store intake payload on certificates so Food/Non-Food Health Cards
-- and Death Certificate Review PDFs can rebuild official layouts on download.
-- Apply in Supabase SQL Editor.

alter table public.certificates
  add column if not exists details jsonb not null default '{}'::jsonb;
