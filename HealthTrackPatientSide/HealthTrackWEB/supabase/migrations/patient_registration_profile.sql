-- Populate first_name / last_name / mobile_phone on patients when a portal account registers.
-- Apply after workflow_schema_update.sql (patients demographic columns exist).

-- Allow trusted system paths (auth trigger, SQL editor backfill) to update patient rows.
create or replace function public.patients_protect_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.bypass_patient_protect', true), '') = '1' then
    return new;
  end if;

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

create or replace function public.handle_auth_user_changed()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  meta jsonb;
  meta_role text;
  meta_app text;
  first_name text;
  last_name text;
  phone text;
  full_name text;
begin
  perform set_config('row_security', 'off', true);
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  meta_role := coalesce(meta->>'role', '');
  meta_app := coalesce(meta->>'app', '');

  if meta_app = 'patient' or meta_role not in ('Admin', 'Doctor', 'Nurse') then
    first_name := nullif(trim(meta->>'first_name'), '');
    last_name := nullif(trim(meta->>'last_name'), '');
    phone := nullif(trim(meta->>'phone'), '');
    full_name := trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''));

    if full_name = '' then
      full_name := coalesce(nullif(trim(meta->>'name'), ''), split_part(new.email, '@', 1), 'Patient');
    end if;

    insert into public.patient_contacts (id, email, phone, first_name, last_name)
    values (new.id, new.email, phone, first_name, last_name)
    on conflict (id) do update set
      email = excluded.email,
      phone = excluded.phone,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      updated_at = now();

    perform set_config('app.bypass_patient_protect', '1', true);

    insert into public.patients (
      patient_auth_id,
      name,
      first_name,
      last_name,
      email,
      phone,
      mobile_phone
    )
    values (new.id, full_name, first_name, last_name, new.email, phone, phone)
    on conflict (patient_auth_id) do update set
      name = excluded.name,
      first_name = coalesce(excluded.first_name, public.patients.first_name),
      last_name = coalesce(excluded.last_name, public.patients.last_name),
      email = excluded.email,
      phone = excluded.phone,
      mobile_phone = coalesce(excluded.mobile_phone, public.patients.mobile_phone),
      patient_number = coalesce(public.patients.patient_number, nextval('public.patient_number_seq'::regclass)),
      updated_at = now();
  end if;

  return new;
exception
  when others then
    return new;
end;
$$;

-- Backfill name parts for existing portal accounts (safe in SQL Editor).
create or replace function public.backfill_patient_registration_names()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  perform set_config('row_security', 'off', true);
  perform set_config('app.bypass_patient_protect', '1', true);

  update public.patients p
  set
    first_name = coalesce(nullif(trim(p.first_name), ''), nullif(trim(pc.first_name), ''), split_part(trim(p.name), ' ', 1)),
    last_name = coalesce(
      nullif(trim(p.last_name), ''),
      nullif(trim(pc.last_name), ''),
      nullif(trim(substring(trim(p.name) from position(' ' in trim(p.name)) + 1)), '')
    ),
    mobile_phone = coalesce(nullif(trim(p.mobile_phone), ''), nullif(trim(p.phone), ''), nullif(trim(pc.phone), ''))
  from public.patient_contacts pc
  where p.patient_auth_id = pc.id
    and p.patient_auth_id is not null
    and (
      nullif(trim(p.first_name), '') is null
      or nullif(trim(p.last_name), '') is null
    );

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.backfill_patient_registration_names() from public;
grant execute on function public.backfill_patient_registration_names() to service_role;

select public.backfill_patient_registration_names() as backfilled_patient_rows;

drop function public.backfill_patient_registration_names();
