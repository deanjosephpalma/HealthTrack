-- BHW / Volunteer roles for patient visit encoding (RHU intake desk).
-- Extends staff portal roles and RLS so encoders can update patients + issue queue numbers.

-- ---------------------------------------------------------------------------
-- 0) Allow SQL Editor / superuser to change roles (service_role already allowed).
--    Supabase SQL Editor does not present a service_role JWT.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Seed scripts (service_role JWT) and dashboard SQL (postgres / supabase_admin)
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin')
     or exists (
       select 1 from pg_roles
       where rolname = current_user and (rolsuper or rolname = 'supabase_admin')
     ) then
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

-- ---------------------------------------------------------------------------
-- 1) Normalize legacy roles that would break the new check constraint
-- ---------------------------------------------------------------------------
alter table public.profiles disable trigger prevent_profile_role_escalation_trg;

update public.profiles
set role = 'Nurse'
where role is null
   or role not in ('Admin', 'Doctor', 'Nurse', 'BHW', 'Volunteer');

-- ---------------------------------------------------------------------------
-- 2) Allow BHW / Volunteer on profiles.role
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('Admin', 'Doctor', 'Nurse', 'BHW', 'Volunteer'));

-- ---------------------------------------------------------------------------
-- 3) Promote known encoder account(s) to BHW now that constraint allows it
-- ---------------------------------------------------------------------------
update public.profiles
set role = 'BHW'
where lower(email) = 'staff.encoder@healthtrack.com';

alter table public.profiles enable trigger prevent_profile_role_escalation_trg;

-- ---------------------------------------------------------------------------
-- 4) Staff helper includes encoders
-- ---------------------------------------------------------------------------
create or replace function public.is_staff_role()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('Doctor', 'Nurse', 'BHW', 'Volunteer');
$$;

revoke all on function public.is_staff_role() from public;
grant execute on function public.is_staff_role() to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Encoders may update patient demographics while encoding
-- ---------------------------------------------------------------------------
drop policy if exists patients_update_roles on public.patients;
create policy patients_update_roles
on public.patients
for update
to authenticated
using (public.current_user_role() in ('Nurse', 'Doctor', 'BHW', 'Volunteer'))
with check (public.current_user_role() in ('Nurse', 'Doctor', 'BHW', 'Volunteer'));

-- ---------------------------------------------------------------------------
-- 6) Audit logging allowed for encoders
-- ---------------------------------------------------------------------------
create or replace function public.log_audit_event(
  p_action text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
  actor_role text;
  next_id uuid;
begin
  perform set_config('row_security', 'off', true);
  actor := auth.uid();
  if actor is null then
    raise exception 'Unauthorized';
  end if;

  actor_role := coalesce(public.current_user_role(), 'Unknown');

  if actor_role not in ('Doctor', 'Nurse', 'BHW', 'Volunteer')
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
