-- Store patient charter intake answers on service_requests
alter table public.service_requests
  add column if not exists intake_data jsonb default '{}'::jsonb;
