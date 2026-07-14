-- Phase 2 security fixes (apply in Supabase SQL Editor after phase1_critical_fixes.sql)
-- 1) Patients can update their own demographics (patients_update_own)
-- 2) Block patient self-edits of privileged staff columns
-- 3) Re-assert OTP search_path / grants (idempotent safety)

-- ---------------------------------------------------------------------------
-- Patient self-update for ProfilePage demographics
-- ---------------------------------------------------------------------------
drop policy if exists patients_update_own on public.patients;
create policy patients_update_own
on public.patients
for update
to authenticated
using (patient_auth_id = auth.uid())
with check (patient_auth_id = auth.uid());

-- Preserve privileged columns when the patient (non-staff) updates their row.
create or replace function public.patients_protect_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Staff (Doctor/Nurse) may manage ownership / archive / encoding fields.
  if public.is_staff_role() then
    return new;
  end if;

  -- Non-staff (patient) may only edit demographics; lock privileged fields.
  if auth.uid() is null or auth.uid() is distinct from old.patient_auth_id then
    raise exception 'Not allowed to update this patient row';
  end if;

  new.patient_auth_id := old.patient_auth_id;
  new.patient_number := old.patient_number;
  new.encoded_by := old.encoded_by;
  new.queue_id := old.queue_id;
  new.archived_at := old.archived_at;
  new.archived_by := old.archived_by;
  new.created_at := old.created_at;

  return new;
end;
$$;

drop trigger if exists patients_protect_self_update on public.patients;
create trigger patients_protect_self_update
before update on public.patients
for each row
execute function public.patients_protect_self_update();

-- ---------------------------------------------------------------------------
-- OTP grants / search_path — re-assert Phase 1 (idempotent)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'verify_pending_code'
  ) then
    execute 'alter function public.verify_pending_code(uuid, text, text) set search_path = public';
    execute 'revoke all on function public.verify_pending_code(uuid, text, text) from public';
    execute 'revoke all on function public.verify_pending_code(uuid, text, text) from anon';
    execute 'grant execute on function public.verify_pending_code(uuid, text, text) to authenticated';
    execute 'grant execute on function public.verify_pending_code(uuid, text, text) to service_role';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_pending_verification'
  ) then
    execute 'alter function public.create_pending_verification(uuid, text, text, integer) set search_path = public';
    execute 'revoke all on function public.create_pending_verification(uuid, text, text, integer) from public';
    execute 'revoke all on function public.create_pending_verification(uuid, text, text, integer) from anon';
    execute 'revoke all on function public.create_pending_verification(uuid, text, text, integer) from authenticated';
    execute 'grant execute on function public.create_pending_verification(uuid, text, text, integer) to service_role';
  end if;
end $$;

-- Drop patient queue UPDATE again if somehow re-created
drop policy if exists queue_update_patient on public.queue;
