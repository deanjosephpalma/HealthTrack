-- Fix patients.patient_auth_id uniqueness so PostgREST upsert / ON CONFLICT works.
-- Partial unique indexes are NOT valid ON CONFLICT targets for PostgREST.

-- Deduplicate any duplicate auth links (keep earliest row)
with ranked as (
  select
    id,
    row_number() over (partition by patient_auth_id order by created_at nulls last, id) as rn
  from public.patients
  where patient_auth_id is not null
)
update public.patients p
set patient_auth_id = null
from ranked r
where p.id = r.id
  and r.rn > 1;

drop index if exists public.patients_patient_auth_id_unique;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'patients_patient_auth_id_key'
      and conrelid = 'public.patients'::regclass
  ) then
    alter table public.patients
      add constraint patients_patient_auth_id_key unique (patient_auth_id);
  end if;
end $$;

-- Ensure auth trigger can upsert portal profiles reliably
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

-- Backfill portal accounts that have patient_contacts but no patients row
insert into public.patients (
  patient_auth_id,
  name,
  first_name,
  last_name,
  email,
  phone,
  mobile_phone
)
select
  pc.id,
  coalesce(
    nullif(trim(coalesce(pc.first_name, '') || ' ' || coalesce(pc.last_name, '')), ''),
    split_part(coalesce(pc.email, 'Patient'), '@', 1),
    'Patient'
  ),
  pc.first_name,
  pc.last_name,
  pc.email,
  pc.phone,
  pc.phone
from public.patient_contacts pc
where not exists (
  select 1 from public.patients p where p.patient_auth_id = pc.id
)
on conflict (patient_auth_id) do nothing;
