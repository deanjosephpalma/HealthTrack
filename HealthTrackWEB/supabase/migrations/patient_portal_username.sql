-- Phone-first patient registration: portal username + helpers
-- Safe to re-run.
-- Backfill runs with session_replication_role=replica so triggers are skipped
-- (patients_protect_self_update / enforce_patient_identity_uniqueness).

alter table public.patients
  add column if not exists portal_username text;

create unique index if not exists patients_portal_username_unique
  on public.patients (portal_username)
  where portal_username is not null;

begin;
  set local session_replication_role = replica;

  update public.patients
  set portal_username = lpad(patient_number::text, greatest(4, length(patient_number::text)), '0')
  where portal_username is null
    and patient_number is not null;
commit;

create or replace function public.allocate_patient_username()
returns table(out_patient_number integer, out_portal_username text)
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
  u text;
begin
  n := nextval('public.patient_number_seq');
  u := lpad(n::text, greatest(4, length(n::text)), '0');
  return query select n, u;
end;
$$;

revoke all on function public.allocate_patient_username() from public;
grant execute on function public.allocate_patient_username() to service_role;

comment on column public.patients.portal_username is
  'Zero-padded patient login username (e.g. 0001). Auth email is {username}@patient.healthtrack.local';
