-- =============================================================================
-- Security hardening: RLS, RPCs, Doctor-only clinical fields, queue guards
-- No Admin product role. Apply in Supabase SQL Editor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Drop legacy open "Allow all" policies (OR'd with stricter policies)
-- ---------------------------------------------------------------------------
drop policy if exists "Allow all on services" on public.services;
drop policy if exists "Allow all on service_requests" on public.service_requests;
drop policy if exists "Allow all on workflow_steps" on public.workflow_steps;
drop policy if exists "Allow all on form_fields" on public.form_fields;
drop policy if exists "Allow all on form_responses" on public.form_responses;
drop policy if exists "Allow all on workflow_status_logs" on public.workflow_status_logs;

-- ---------------------------------------------------------------------------
-- 2) Helper: staff role check without Admin
-- ---------------------------------------------------------------------------
create or replace function public.is_staff_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('Doctor', 'Nurse');
$$;

create or replace function public.is_patient_owner(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.patients p
    where p.id = p_patient_id
      and p.patient_auth_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 3) Queue: authenticated insert only; patients own rows; staff manage
-- ---------------------------------------------------------------------------
drop policy if exists queue_insert_mobile on public.queue;
drop policy if exists queue_insert_authenticated on public.queue;
create policy queue_insert_authenticated
on public.queue
for insert
to authenticated
with check (
  public.is_staff_role()
  or (
    patient_id is not null
    and public.is_patient_owner(patient_id)
  )
);

drop policy if exists queue_select_dashboard on public.queue;
create policy queue_select_staff
on public.queue
for select
to authenticated
using (public.is_staff_role());

drop policy if exists queue_select_own on public.queue;
create policy queue_select_own
on public.queue
for select
to authenticated
using (
  patient_id is not null
  and public.is_patient_owner(patient_id)
);

drop policy if exists queue_update_dashboard on public.queue;
create policy queue_update_staff
on public.queue
for update
to authenticated
using (public.is_staff_role())
with check (public.is_staff_role());

-- Prevent patients from updating queue status (no patient UPDATE policy)

-- Duplicate active ticket guard (same patient + reason-ish day while waiting/called/next)
create or replace function public.prevent_duplicate_active_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_status text;
begin
  active_status := lower(coalesce(new.status, 'waiting'));
  if active_status in ('waiting', 'next', 'called', 'in_progress', 'serving')
     and new.patient_id is not null then
    if exists (
      select 1 from public.queue q
      where q.patient_id = new.patient_id
        and q.id is distinct from new.id
        and coalesce(q.archived_at, null) is null
        and lower(coalesce(q.status, '')) in ('waiting', 'next', 'called', 'in_progress', 'serving')
        and coalesce(q.reason, '') = coalesce(new.reason, '')
        and q.created_at::date = coalesce(new.created_at, now())::date
    ) then
      raise exception 'Duplicate active queue ticket for this patient/service today';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_duplicate_active_queue_trg on public.queue;
create trigger prevent_duplicate_active_queue_trg
before insert or update on public.queue
for each row
execute function public.prevent_duplicate_active_queue();

-- ---------------------------------------------------------------------------
-- 4) Verification OTP: revoke anon; service_role only
-- ---------------------------------------------------------------------------
revoke all on function public.create_pending_verification(uuid, text, text, integer) from public;
revoke all on function public.create_pending_verification(uuid, text, text, integer) from anon;
revoke all on function public.create_pending_verification(uuid, text, text, integer) from authenticated;
grant execute on function public.create_pending_verification(uuid, text, text, integer) to service_role;

revoke all on function public.verify_pending_code(uuid, text, text) from public;
-- Patients still need to verify via app (authenticated) OR only via Laravel service_role.
-- Prefer Laravel path: revoke from authenticated; Laravel uses service_role.
revoke all on function public.verify_pending_code(uuid, text, text) from anon;
revoke all on function public.verify_pending_code(uuid, text, text) from authenticated;
grant execute on function public.verify_pending_code(uuid, text, text) to service_role;
grant execute on function public.verify_pending_code(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Dangerous RPCs: service_role only
-- ---------------------------------------------------------------------------
revoke all on function public.purge_archived_data(integer) from public;
revoke all on function public.purge_archived_data(integer) from anon;
revoke all on function public.purge_archived_data(integer) from authenticated;
grant execute on function public.purge_archived_data(integer) to service_role;

revoke all on function public.admin_delete_user(uuid) from public;
revoke all on function public.admin_delete_user(uuid) from anon;
revoke all on function public.admin_delete_user(uuid) from authenticated;
grant execute on function public.admin_delete_user(uuid) to service_role;

do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_sync_profiles'
  ) then
    execute 'revoke all on function public.admin_sync_profiles() from public';
    execute 'revoke all on function public.admin_sync_profiles() from anon';
    execute 'revoke all on function public.admin_sync_profiles() from authenticated';
    execute 'grant execute on function public.admin_sync_profiles() to service_role';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Strip Admin from core staff policies (patients, records, appointments, inventory)
-- ---------------------------------------------------------------------------
drop policy if exists patients_select_roles on public.patients;
create policy patients_select_roles
on public.patients
for select
to authenticated
using (public.is_staff_role() or patient_auth_id = auth.uid());

drop policy if exists patients_insert_roles on public.patients;
create policy patients_insert_roles
on public.patients
for insert
to authenticated
with check (public.current_user_role() = 'Nurse' or patient_auth_id = auth.uid());

drop policy if exists patients_update_roles on public.patients;
create policy patients_update_roles
on public.patients
for update
to authenticated
using (public.current_user_role() in ('Nurse', 'Doctor'))
with check (public.current_user_role() in ('Nurse', 'Doctor'));

drop policy if exists patients_insert_own on public.patients;
create policy patients_insert_own
on public.patients
for insert
to authenticated
with check (patient_auth_id = auth.uid() and queue_id is null and encoded_by is null);

drop policy if exists appointments_select_roles on public.appointments;
create policy appointments_select_roles
on public.appointments
for select
to authenticated
using (public.is_staff_role());

drop policy if exists appointments_write_roles on public.appointments;
create policy appointments_write_roles
on public.appointments
for all
to authenticated
using (public.is_staff_role())
with check (public.is_staff_role());

drop policy if exists patient_records_select_roles on public.patient_records;
create policy patient_records_select_roles
on public.patient_records
for select
to authenticated
using (public.is_staff_role());

drop policy if exists patient_records_write_roles on public.patient_records;
create policy patient_records_write_roles
on public.patient_records
for all
to authenticated
using (public.is_staff_role())
with check (public.is_staff_role());

drop policy if exists inventory_select_roles on public.inventory_items;
create policy inventory_select_roles
on public.inventory_items
for select
to authenticated
using (public.is_staff_role());

drop policy if exists inventory_write_roles on public.inventory_items;
create policy inventory_write_roles
on public.inventory_items
for all
to authenticated
using (public.is_staff_role())
with check (public.is_staff_role());

-- Certificates / permits staff policies (neutralize Admin)
do $$
begin
  if to_regclass('public.certificates') is not null then
    execute 'drop policy if exists certificates_staff on public.certificates';
    execute 'drop policy if exists certificates_staff_all on public.certificates';
    execute $p$
      create policy certificates_staff
      on public.certificates
      for all
      to authenticated
      using (public.is_staff_role())
      with check (public.is_staff_role())
    $p$;
  end if;
  if to_regclass('public.permits') is not null then
    execute 'drop policy if exists permits_staff on public.permits';
    execute 'drop policy if exists permits_staff_all on public.permits';
    execute $p$
      create policy permits_staff
      on public.permits
      for all
      to authenticated
      using (public.is_staff_role())
      with check (public.is_staff_role())
    $p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7) Doctor-only diagnosis (Nurse cannot set/change diagnosis)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_doctor_only_diagnosis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role text := public.current_user_role();
begin
  -- service_role / null role (bypass path): allow
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if role = 'Doctor' then
    return new;
  end if;

  if role = 'Nurse' then
    if tg_op = 'INSERT' then
      if nullif(trim(coalesce(new.diagnosis, '')), '') is not null then
        raise exception 'Forbidden: only Doctors may set diagnosis';
      end if;
    elsif tg_op = 'UPDATE' then
      if coalesce(new.diagnosis, '') is distinct from coalesce(old.diagnosis, '') then
        raise exception 'Forbidden: only Doctors may modify diagnosis';
      end if;
    end if;
    return new;
  end if;

  -- Other roles: block diagnosis changes on write
  if tg_op = 'INSERT' and nullif(trim(coalesce(new.diagnosis, '')), '') is not null then
    raise exception 'Forbidden: diagnosis write denied';
  end if;
  if tg_op = 'UPDATE' and coalesce(new.diagnosis, '') is distinct from coalesce(old.diagnosis, '') then
    raise exception 'Forbidden: diagnosis write denied';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_doctor_only_diagnosis_trg on public.patient_records;
create trigger enforce_doctor_only_diagnosis_trg
before insert or update on public.patient_records
for each row
execute function public.enforce_doctor_only_diagnosis();

-- ---------------------------------------------------------------------------
-- 8) email_logs / estimated_cases — close open inserts
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.email_logs') is not null then
    execute 'drop policy if exists "Allow anonymous inserts to email_logs" on public.email_logs';
    execute 'drop policy if exists email_logs_insert_staff on public.email_logs';
    execute $p$
      create policy email_logs_insert_staff
      on public.email_logs
      for insert
      to authenticated
      with check (public.is_staff_role())
    $p$;
  end if;
end $$;

drop policy if exists estimated_cases_insert on public.estimated_cases;
create policy estimated_cases_insert
on public.estimated_cases
for insert
to authenticated
with check (public.is_staff_role());

drop policy if exists estimated_cases_select on public.estimated_cases;
create policy estimated_cases_select
on public.estimated_cases
for select
to authenticated
using (public.is_staff_role());

drop policy if exists estimated_cases_update on public.estimated_cases;
create policy estimated_cases_update
on public.estimated_cases
for update
to authenticated
using (public.is_staff_role())
with check (public.is_staff_role());

drop policy if exists estimated_cases_delete on public.estimated_cases;
create policy estimated_cases_delete
on public.estimated_cases
for delete
to authenticated
using (public.is_staff_role());

-- ---------------------------------------------------------------------------
-- 9) Profiles: block self-promotion; no Admin policies
-- ---------------------------------------------------------------------------
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_insert_admin on public.profiles;
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists profiles_update_own_safe on public.profiles;
create policy profiles_update_own_safe
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Inserts only via service_role (seed scripts). No INSERT policy for authenticated.

create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Forbidden: staff profiles must be provisioned by service role';
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    raise exception 'Forbidden: cannot change profile role';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_profile_role_escalation_trg on public.profiles;
create trigger prevent_profile_role_escalation_trg
before insert or update on public.profiles
for each row
execute function public.prevent_profile_role_escalation();

-- ---------------------------------------------------------------------------
-- 10) Audit logs: Doctor/Nurse read; login events for authenticated staff
-- ---------------------------------------------------------------------------
drop policy if exists audit_logs_select_admin on public.audit_logs;
drop policy if exists audit_logs_select_staff on public.audit_logs;
create policy audit_logs_select_staff
on public.audit_logs
for select
to authenticated
using (public.is_staff_role());

create or replace function public.log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  next_id uuid;
  actor uuid;
  actor_role text;
begin
  perform set_config('row_security', 'off', true);
  actor := auth.uid();
  if actor is null then
    raise exception 'Unauthorized';
  end if;

  actor_role := coalesce(public.current_user_role(), 'Unknown');

  -- Staff actions + own login/logout for any authenticated user with a profile
  if actor_role not in ('Doctor', 'Nurse')
     and p_action not in ('login_success', 'login_failed', 'logout') then
    raise exception 'Forbidden';
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (actor, actor_role, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into next_id;

  return next_id;
end;
$$;

revoke all on function public.log_audit_event(text, text, uuid, jsonb) from public;
grant execute on function public.log_audit_event(text, text, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 11) Ensure patient-owned service_requests if table exists
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.service_requests') is not null then
    execute 'drop policy if exists service_requests_staff_all on public.service_requests';
    begin
      execute $p$
        create policy service_requests_staff_all
        on public.service_requests
        for all
        to authenticated
        using (public.is_staff_role())
        with check (public.is_staff_role())
      $p$;
    exception when duplicate_object then null;
    end;

    execute 'drop policy if exists service_requests_select_own on public.service_requests';
    begin
      execute $p$
        create policy service_requests_select_own
        on public.service_requests
        for select
        to authenticated
        using (
          patient_id is not null
          and public.is_patient_owner(patient_id)
        )
      $p$;
    exception when duplicate_object then null;
    end;
  end if;
end $$;
