-- Priority queue support: Senior Citizen (60+) and PWD.
-- Apply in Supabase SQL Editor after existing queue/patient migrations.

alter table public.queue
  add column if not exists is_priority boolean not null default false;

alter table public.queue
  add column if not exists priority_labels text;

create index if not exists queue_is_priority_idx
  on public.queue (is_priority)
  where archived_at is null and is_priority = true;

-- Persist birthdate + disability from portal registration metadata.
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
  birthdate date;
  disability text;
begin
  perform set_config('row_security', 'off', true);
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  meta_role := coalesce(meta->>'role', '');
  meta_app := coalesce(meta->>'app', '');

  if meta_app = 'patient' or meta_role not in ('Admin', 'Doctor', 'Nurse', 'BHW', 'Volunteer') then
    first_name := nullif(trim(meta->>'first_name'), '');
    last_name := nullif(trim(meta->>'last_name'), '');
    phone := nullif(trim(meta->>'phone'), '');
    full_name := trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''));
    birthdate := nullif(trim(meta->>'birthdate'), '')::date;
    disability := nullif(trim(meta->>'disability'), '');

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
      mobile_phone,
      birthdate,
      disability
    )
    values (new.id, full_name, first_name, last_name, new.email, phone, phone, birthdate, disability)
    on conflict (patient_auth_id) do update set
      name = excluded.name,
      first_name = coalesce(excluded.first_name, public.patients.first_name),
      last_name = coalesce(excluded.last_name, public.patients.last_name),
      email = excluded.email,
      phone = excluded.phone,
      mobile_phone = coalesce(excluded.mobile_phone, public.patients.mobile_phone),
      birthdate = coalesce(excluded.birthdate, public.patients.birthdate),
      disability = coalesce(excluded.disability, public.patients.disability),
      patient_number = coalesce(public.patients.patient_number, nextval('public.patient_number_seq'::regclass)),
      updated_at = now();
  end if;

  return new;
exception
  when others then
    return new;
end;
$$;
