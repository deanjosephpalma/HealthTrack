create extension if not exists pgcrypto;

-- Profiles link Supabase Auth users to application roles.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null default 'Nurse',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
alter column role set default 'Nurse';

alter table public.profiles
drop constraint if exists profiles_role_check;

alter table public.profiles
add constraint profiles_role_check check (role in ('Admin', 'Doctor', 'Nurse'));

-- Queue table receives submissions from the mobile app.
create table if not exists public.queue (
  id uuid primary key default gen_random_uuid(),
  queue_number integer check (queue_number is null or queue_number >= 1),
  patient_name text not null,
  reason text,
  appointment_id uuid,
  patient_id uuid,
  status text not null default 'waiting' check (status in ('waiting', 'in_progress', 'done', 'cancelled')),
  archived_at timestamptz,
  archived_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.queue add column if not exists queue_number integer;
alter table public.queue add column if not exists appointment_id uuid;
alter table public.queue add column if not exists patient_id uuid;
alter table public.queue add column if not exists archived_at timestamptz;
alter table public.queue add column if not exists archived_by uuid references auth.users (id) on delete set null;

create index if not exists queue_archived_at_idx on public.queue (archived_at);

-- Encoded patient records are created from queue entries by nurses.
create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid unique references public.queue (id) on delete set null,
  patient_auth_id uuid references auth.users (id) on delete set null,
  patient_number integer,
  name text not null,
  email text,
  phone text,
  notes text,
  encoded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patients add column if not exists patient_auth_id uuid references auth.users (id) on delete set null;
alter table public.patients add column if not exists patient_number integer;
alter table public.patients add column if not exists archived_at timestamptz;
alter table public.patients add column if not exists archived_by uuid references auth.users (id) on delete set null;

create sequence if not exists public.patient_number_seq start 1;
alter table public.patients alter column patient_number set default nextval('public.patient_number_seq'::regclass);

update public.patients
set patient_number = nextval('public.patient_number_seq'::regclass)
where patient_number is null;

select setval(
  'public.patient_number_seq'::regclass,
  coalesce((select max(patient_number) from public.patients), 0) + 1,
  false
);

create unique index if not exists patients_patient_number_unique on public.patients (patient_number);

create unique index if not exists patients_patient_auth_id_unique
on public.patients (patient_auth_id)
where patient_auth_id is not null;

insert into public.patients (patient_auth_id, name, email, phone)
select
  pc.id,
  case
    when trim(coalesce(pc.first_name, '') || ' ' || coalesce(pc.last_name, '')) <> ''
      then trim(coalesce(pc.first_name, '') || ' ' || coalesce(pc.last_name, ''))
    when pc.email is not null and pc.email <> ''
      then split_part(pc.email, '@', 1)
    else 'Patient'
  end as name,
  pc.email,
  pc.phone
from public.patient_contacts pc
where not exists (
  select 1 from public.patients p where p.patient_auth_id = pc.id
);

-- Appointments remain empty until scheduled from patient workflows.
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients (id) on delete cascade,
  patient_auth_id uuid references auth.users (id) on delete set null,
  queue_id uuid references public.queue (id) on delete set null,
  patient_name text not null,
  appointment_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'checked_in', 'in_queue', 'completed', 'cancelled', 'no_show')),
  reason text,
  preferred_schedule text,
  notes text,
  doctor_queue_status text,
  archived_at timestamptz,
  archived_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Medical records are created after nurse consultation encoding.
create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients (id) on delete cascade,
  patient_auth_id uuid references auth.users (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  patient_name text not null,
  diagnosis text,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments add column if not exists patient_auth_id uuid references auth.users (id) on delete set null;
alter table public.appointments add column if not exists queue_id uuid references public.queue (id) on delete set null;
alter table public.appointments add column if not exists reason text;
alter table public.appointments add column if not exists preferred_schedule text;
alter table public.appointments add column if not exists doctor_queue_status text;
alter table public.appointments add column if not exists archived_at timestamptz;
alter table public.appointments add column if not exists archived_by uuid references auth.users (id) on delete set null;

create index if not exists appointments_archived_at_idx on public.appointments (archived_at);

alter table public.medical_records add column if not exists patient_auth_id uuid references auth.users (id) on delete set null;
alter table public.medical_records add column if not exists appointment_id uuid references public.appointments (id) on delete set null;

create unique index if not exists medical_records_appointment_id_unique
on public.medical_records (appointment_id)
where appointment_id is not null;

alter table public.queue drop constraint if exists queue_appointment_id_fkey;
alter table public.queue
add constraint queue_appointment_id_fkey
foreign key (appointment_id) references public.appointments (id) on delete set null;

alter table public.queue drop constraint if exists queue_patient_id_fkey;
alter table public.queue
add constraint queue_patient_id_fkey
foreign key (patient_id) references public.patients (id) on delete set null;

update public.appointments
set status = case
  when status is null or btrim(status) = '' then 'scheduled'
  when lower(btrim(status)) in ('scheduled', 'checked_in', 'in_queue', 'completed', 'cancelled', 'no_show') then lower(btrim(status))
  when lower(btrim(status)) = 'done' then 'completed'
  when lower(btrim(status)) = 'pending' then 'scheduled'
  when lower(btrim(status)) = 'canceled' then 'cancelled'
  else 'scheduled'
end
where status is null
   or btrim(status) = ''
   or lower(btrim(status)) not in ('scheduled', 'checked_in', 'in_queue', 'completed', 'cancelled', 'no_show');

alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments
add constraint appointments_status_check
check (status in ('scheduled', 'checked_in', 'in_queue', 'completed', 'cancelled', 'no_show'));

create table if not exists public.patient_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients (id) on delete set null,
  patient_auth_id uuid references auth.users (id) on delete set null,
  appointment_id uuid references public.appointments (id) on delete set null,
  queue_id uuid references public.queue (id) on delete set null,
  patient_name text not null,
  first_name text,
  middle_name text,
  last_name text,
  philhealth_number text,
  age integer,
  sex text,
  birthdate date,
  mother_maiden_name text,
  civil_status text,
  religion text,
  blood_type text,
  mobile_phone text,
  education text,
  occupation text,
  disability text,
  house_no_purok text,
  barangay text,
  municipality text not null default 'Pila',
  province text not null default 'Laguna',
  member_name text,
  member_birthdate date,
  medcert_pwd boolean,
  medcert_work boolean,
  medcert_financial boolean,
  medcert_4ps boolean,
  medcert_school boolean,
  medcert_others text,
  date_of_consultation date,
  wt numeric,
  temp numeric,
  bp text,
  pr_hr text,
  rr text,
  ht numeric,
  spo2 numeric,
  waist numeric,
  hip numeric,
  operation_name text,
  operation_date date,
  female_age_first_menses integer,
  lmp date,
  gravida integer,
  para integer,
  cs_date date,
  nsd_date date,
  female_age_first_pregnancy integer,
  menopausal_age integer,
  diagnosis text,
  notes text,
  covid_vaccine_brand text,
  covid_vaccine_date date,
  other_vaccines text,
  flu_vaccine_date date,
  pneumo_vaccine_date date,
  td_vaccine_date date,
  latitude numeric,
  longitude numeric,
  created_by uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users (id) on delete set null,
  workflow_status text not null default 'completed',
  assigned_doctor_id uuid references auth.users (id) on delete set null,
  nurse_completed_at timestamptz,
  doctor_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.patient_records add column if not exists first_name text;
alter table public.patient_records add column if not exists middle_name text;
alter table public.patient_records add column if not exists last_name text;
alter table public.patient_records add column if not exists mother_maiden_name text;
alter table public.patient_records add column if not exists member_name text;
alter table public.patient_records add column if not exists member_birthdate date;
alter table public.patient_records add column if not exists medcert_pwd boolean;
alter table public.patient_records add column if not exists medcert_work boolean;
alter table public.patient_records add column if not exists medcert_financial boolean;
alter table public.patient_records add column if not exists medcert_4ps boolean;
alter table public.patient_records add column if not exists medcert_school boolean;
alter table public.patient_records add column if not exists medcert_others text;
alter table public.patient_records add column if not exists operation_name text;
alter table public.patient_records add column if not exists operation_date date;
alter table public.patient_records add column if not exists female_age_first_menses integer;
alter table public.patient_records add column if not exists lmp date;
alter table public.patient_records add column if not exists gravida integer;
alter table public.patient_records add column if not exists para integer;
alter table public.patient_records add column if not exists cs_date date;
alter table public.patient_records add column if not exists nsd_date date;
alter table public.patient_records add column if not exists female_age_first_pregnancy integer;
alter table public.patient_records add column if not exists menopausal_age integer;
alter table public.patient_records add column if not exists flu_vaccine_date date;
alter table public.patient_records add column if not exists pneumo_vaccine_date date;
alter table public.patient_records add column if not exists td_vaccine_date date;
alter table public.patient_records add column if not exists appointment_id uuid references public.appointments (id) on delete set null;
alter table public.patient_records add column if not exists queue_id uuid references public.queue (id) on delete set null;
alter table public.patient_records add column if not exists patient_auth_id uuid references auth.users (id) on delete set null;
alter table public.patient_records add column if not exists archived_at timestamptz;
alter table public.patient_records add column if not exists archived_by uuid references auth.users (id) on delete set null;
alter table public.patient_records add column if not exists workflow_status text;
alter table public.patient_records add column if not exists assigned_doctor_id uuid references auth.users (id) on delete set null;
alter table public.patient_records add column if not exists nurse_completed_at timestamptz;
alter table public.patient_records add column if not exists doctor_completed_at timestamptz;
alter table public.patient_records add column if not exists tb_classification text;

alter table public.patient_records alter column workflow_status set default 'completed';
update public.patient_records set workflow_status = 'completed' where workflow_status is null;

create index if not exists patient_records_patient_auth_id_idx on public.patient_records (patient_auth_id);
create index if not exists patient_records_appointment_id_idx on public.patient_records (appointment_id);
create index if not exists patient_records_archived_at_idx on public.patient_records (archived_at);
create index if not exists patient_records_workflow_status_idx on public.patient_records (workflow_status);

update public.patient_records pr
set patient_auth_id = a.patient_auth_id
from public.appointments a
where pr.patient_auth_id is null
  and pr.appointment_id is not null
  and pr.appointment_id = a.id
  and a.patient_auth_id is not null;

-- Inventory starts at zero and increases as stock is added.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  unit text not null default 'pcs',
  notes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.patient_contacts (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  phone text,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_email_registered(p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if normalized_email = '' then
    return false;
  end if;

  return exists (
    select 1 from public.profiles p where lower(trim(coalesce(p.email, ''))) = normalized_email
  ) or exists (
    select 1 from public.patient_contacts pc where lower(trim(coalesce(pc.email, ''))) = normalized_email
  ) or exists (
    select 1 from public.patients pt where lower(trim(coalesce(pt.email, ''))) = normalized_email
  );
end;
$$;

create or replace function public.is_name_registered(p_name text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_name text := lower(trim(coalesce(p_name, '')));
begin
  if normalized_name = '' then
    return false;
  end if;

  return exists (
    select 1 from public.profiles p where lower(trim(coalesce(p.name, ''))) = normalized_name
  ) or exists (
    select 1 from public.patient_contacts pc where lower(trim(concat_ws(' ', coalesce(pc.first_name, ''), coalesce(pc.last_name, '')))) = normalized_name
  ) or exists (
    select 1 from public.patients pt where lower(trim(coalesce(pt.name, ''))) = normalized_name
  );
end;
$$;

create or replace function public.normalize_existing_patient_identity_duplicates()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with duplicate_patients as (
    select
      id,
      row_number() over (
        partition by lower(trim(name))
        order by created_at, id
      ) as rn
    from public.patients
    where trim(coalesce(name, '')) <> ''
  )
  update public.patients p
  set name = concat(p.name, ' #', duplicate_patients.rn)
  from duplicate_patients
  where p.id = duplicate_patients.id
    and duplicate_patients.rn > 1;

  with duplicate_contacts as (
    select
      id,
      row_number() over (
        partition by lower(trim(concat_ws(' ', coalesce(first_name, ''), coalesce(last_name, ''))))
        order by created_at, id
      ) as rn
    from public.patient_contacts
    where trim(concat_ws(' ', coalesce(first_name, ''), coalesce(last_name, ''))) <> ''
  )
  update public.patient_contacts pc
  set last_name = concat(coalesce(nullif(pc.last_name, ''), ''), case when coalesce(pc.last_name, '') <> '' then ' ' else '' end, '#', duplicate_contacts.rn)
  from duplicate_contacts
  where pc.id = duplicate_contacts.id
    and duplicate_contacts.rn > 1;
end;
$$;

select public.normalize_existing_patient_identity_duplicates();

create or replace function public.enforce_patient_identity_uniqueness()
returns trigger
language plpgsql
as $$
declare
  normalized_email text := lower(trim(coalesce(new.email, '')));
  normalized_contact_name text := '';
  normalized_patient_name text := '';
  current_identity_key text := '';
begin
  if tg_table_name = 'patient_contacts' then
    normalized_contact_name := lower(trim(concat_ws(' ', coalesce(new.first_name, ''), coalesce(new.last_name, ''))));
    current_identity_key := new.id::text;

    if normalized_email <> '' and (
      exists (
        select 1
        from public.patient_contacts pc
        where lower(trim(coalesce(pc.email, ''))) = normalized_email
          and pc.id <> new.id
      )
      or exists (
        select 1
        from public.patients p
        where lower(trim(coalesce(p.email, ''))) = normalized_email
          and coalesce(p.patient_auth_id::text, p.id::text) <> new.id::text
      )
    ) then
      raise exception 'This email is already registered.';
    end if;

    if normalized_contact_name <> '' and (
      exists (
        select 1
        from public.patient_contacts pc
        where lower(trim(concat_ws(' ', coalesce(pc.first_name, ''), coalesce(pc.last_name, '')))) = normalized_contact_name
          and pc.id <> new.id
      )
      or exists (
        select 1
        from public.patients p
        where lower(trim(coalesce(p.name, ''))) = normalized_contact_name
          and coalesce(p.patient_auth_id::text, p.id::text) <> new.id::text
      )
    ) then
      raise exception 'This name is already registered.';
    end if;
  elsif tg_table_name = 'patients' then
    normalized_patient_name := lower(trim(coalesce(new.name, '')));
    current_identity_key := coalesce(new.patient_auth_id::text, new.id::text);

    if normalized_email <> '' and (
      exists (
        select 1
        from public.patient_contacts pc
        where lower(trim(coalesce(pc.email, ''))) = normalized_email
          and pc.id::text <> current_identity_key
      )
      or exists (
        select 1
        from public.patients p
        where lower(trim(coalesce(p.email, ''))) = normalized_email
          and coalesce(p.patient_auth_id::text, p.id::text) <> current_identity_key
      )
    ) then
      raise exception 'This email is already registered.';
    end if;

    if normalized_patient_name <> '' and (
      exists (
        select 1
        from public.patient_contacts pc
        where lower(trim(concat_ws(' ', coalesce(pc.first_name, ''), coalesce(pc.last_name, '')))) = normalized_patient_name
          and pc.id::text <> current_identity_key
      )
      or exists (
        select 1
        from public.patients p
        where lower(trim(coalesce(p.name, ''))) = normalized_patient_name
          and coalesce(p.patient_auth_id::text, p.id::text) <> current_identity_key
      )
    ) then
      raise exception 'This name is already registered.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Keep timestamps current.
drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_queue_updated_at on public.queue;
create trigger set_queue_updated_at
before update on public.queue
for each row execute function public.set_updated_at();

drop trigger if exists set_patients_updated_at on public.patients;
create trigger set_patients_updated_at
before update on public.patients
for each row execute function public.set_updated_at();

drop trigger if exists set_appointments_updated_at on public.appointments;
create trigger set_appointments_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

drop trigger if exists set_medical_records_updated_at on public.medical_records;
create trigger set_medical_records_updated_at
before update on public.medical_records
for each row execute function public.set_updated_at();

drop trigger if exists set_patient_records_updated_at on public.patient_records;
create trigger set_patient_records_updated_at
before update on public.patient_records
for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

drop trigger if exists set_patient_contacts_updated_at on public.patient_contacts;
create trigger set_patient_contacts_updated_at
before update on public.patient_contacts
for each row execute function public.set_updated_at();

drop trigger if exists enforce_patient_identity_uniqueness_on_patient_contacts on public.patient_contacts;
create trigger enforce_patient_identity_uniqueness_on_patient_contacts
before insert or update on public.patient_contacts
for each row execute function public.enforce_patient_identity_uniqueness();

drop trigger if exists enforce_patient_identity_uniqueness_on_patients on public.patients;
create trigger enforce_patient_identity_uniqueness_on_patients
before insert or update on public.patients
for each row execute function public.enforce_patient_identity_uniqueness();

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), '')
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

    insert into public.patients (patient_auth_id, name, email, phone)
    values (new.id, full_name, new.email, phone)
    on conflict (patient_auth_id) do update set
      name = excluded.name,
      email = excluded.email,
      phone = excluded.phone,
      patient_number = coalesce(public.patients.patient_number, nextval('public.patient_number_seq'::regclass)),
      updated_at = now();
  end if;

  return new;
exception
  when others then
    return new;
end;
$$;

drop trigger if exists on_auth_user_changed on auth.users;
create trigger on_auth_user_changed
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.handle_auth_user_changed();

create or replace function public.set_appointment_patient_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('row_security', 'off', true);

  if new.patient_auth_id is not null then
    if new.patient_id is null then
      select p.id
      into new.patient_id
      from public.patients p
      where p.patient_auth_id = new.patient_auth_id
      limit 1;
    end if;

    if new.patient_id is null then
      insert into public.patients (patient_auth_id, name, email, phone)
      values (new.patient_auth_id, coalesce(nullif(trim(new.patient_name), ''), 'Patient'), null, null)
      returning id into new.patient_id;
    end if;

    update public.patients
    set patient_number = coalesce(patient_number, nextval('public.patient_number_seq'::regclass))
    where id = new.patient_id
      and patient_number is null;
  end if;

  return new;
end;
$$;

create or replace function public.set_queue_patient_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  appt_patient_id uuid;
  appt_patient_auth_id uuid;
  appt_patient_name text;
begin
  perform set_config('row_security', 'off', true);

  if new.patient_id is null and new.appointment_id is not null then
    select a.patient_id, a.patient_auth_id, a.patient_name
    into appt_patient_id, appt_patient_auth_id, appt_patient_name
    from public.appointments a
    where a.id = new.appointment_id
    limit 1;

    if appt_patient_id is null and appt_patient_auth_id is not null then
      select p.id
      into appt_patient_id
      from public.patients p
      where p.patient_auth_id = appt_patient_auth_id
      limit 1;
    end if;

    if appt_patient_id is null and appt_patient_auth_id is not null then
      insert into public.patients (patient_auth_id, name)
      values (appt_patient_auth_id, coalesce(nullif(trim(appt_patient_name), ''), 'Patient'))
      returning id into appt_patient_id;
    end if;

    if appt_patient_id is not null then
      update public.patients
      set patient_number = coalesce(patient_number, nextval('public.patient_number_seq'::regclass))
      where id = appt_patient_id
        and patient_number is null;
    end if;

    new.patient_id := appt_patient_id;
  end if;

  return new;
end;
$$;

drop trigger if exists set_appointments_patient_id on public.appointments;
create trigger set_appointments_patient_id
before insert or update of patient_auth_id on public.appointments
for each row execute function public.set_appointment_patient_id();

drop trigger if exists set_queue_patient_id on public.queue;
create trigger set_queue_patient_id
before insert or update of appointment_id on public.queue
for each row execute function public.set_queue_patient_id();

update public.appointments a
set patient_id = p.id
from public.patients p
where a.patient_id is null
  and a.patient_auth_id is not null
  and p.patient_auth_id = a.patient_auth_id;

insert into public.patients (patient_auth_id, name)
select distinct
  a.patient_auth_id,
  coalesce(nullif(trim(a.patient_name), ''), 'Patient')
from public.appointments a
where a.patient_auth_id is not null
  and not exists (select 1 from public.patients p where p.patient_auth_id = a.patient_auth_id);

update public.appointments a
set patient_id = p.id
from public.patients p
where a.patient_id is null
  and a.patient_auth_id is not null
  and p.patient_auth_id = a.patient_auth_id;

update public.queue q
set patient_id = coalesce(q.patient_id, a.patient_id)
from public.appointments a
where q.patient_id is null
  and q.appointment_id is not null
  and a.id = q.appointment_id;

update public.patients
set patient_number = nextval('public.patient_number_seq'::regclass)
where patient_number is null;

select setval(
  'public.patient_number_seq'::regclass,
  coalesce((select max(patient_number) from public.patients), 0) + 1,
  false
);

alter table public.profiles enable row level security;
alter table public.queue enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.medical_records enable row level security;
alter table public.patient_records enable row level security;
alter table public.inventory_items enable row level security;
alter table public.patient_contacts enable row level security;

-- Profiles: users can only manage their own profile.
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (auth.uid() = id and role = 'Nurse');

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin
on public.profiles
for insert
to authenticated
with check (public.current_user_role() = 'Admin');

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin
on public.profiles
for select
to authenticated
using (public.current_user_role() = 'Admin');

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
on public.profiles
for update
to authenticated
using (public.current_user_role() = 'Admin')
with check (public.current_user_role() = 'Admin');

create or replace function public.admin_sync_profiles()
returns integer
language plpgsql
security definer
set search_path = auth, public
as $$
declare synced_count integer;
begin
  if public.current_user_role() <> 'Admin' then
    raise exception 'Forbidden';
  end if;

  insert into public.profiles (id, name, email, role)
  select
    u.id,
    coalesce(nullif(u.raw_user_meta_data->>'name', ''), split_part(u.email, '@', 1), 'Unknown'),
    u.email,
    case
      when u.raw_user_meta_data->>'role' in ('Admin', 'Doctor', 'Nurse') then u.raw_user_meta_data->>'role'
      else 'Nurse'
    end
  from auth.users u
  where coalesce(u.raw_user_meta_data->>'app', '') <> 'patient'
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email,
    role = excluded.role,
    updated_at = now();

  get diagnostics synced_count = row_count;
  return synced_count;
end;
$$;

revoke all on function public.admin_sync_profiles() from public;
grant execute on function public.admin_sync_profiles() to authenticated;

create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if public.current_user_role() <> 'Admin' then
    raise exception 'Forbidden';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'Cannot delete own account';
  end if;

  perform set_config('row_security', 'off', true);

  delete from public.patient_records
  where patient_auth_id = target_user_id
     or patient_id in (select id from public.patients where patient_auth_id = target_user_id);

  delete from public.medical_records
  where patient_auth_id = target_user_id
     or patient_id in (select id from public.patients where patient_auth_id = target_user_id);

  delete from public.queue
  where patient_id in (select id from public.patients where patient_auth_id = target_user_id)
     or appointment_id in (
       select id from public.appointments
       where patient_auth_id = target_user_id
          or patient_id in (select id from public.patients where patient_auth_id = target_user_id)
     );

  delete from public.appointments
  where patient_auth_id = target_user_id
     or patient_id in (select id from public.patients where patient_auth_id = target_user_id);

  delete from public.patient_contacts where id = target_user_id;
  delete from public.patients where patient_auth_id = target_user_id;
  delete from public.profiles where id = target_user_id;

  delete from auth.users where id = target_user_id;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Queue: mobile app can insert, dashboard roles can read and update.
drop policy if exists queue_insert_mobile on public.queue;
create policy queue_insert_mobile
on public.queue
for insert
to anon, authenticated
with check (true);

drop policy if exists queue_select_dashboard on public.queue;
create policy queue_select_dashboard
on public.queue
for select
to authenticated
using (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'));

drop policy if exists queue_update_dashboard on public.queue;
create policy queue_update_dashboard
on public.queue
for update
to authenticated
using (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'))
with check (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'));

-- Patients: admin, doctor, nurse can read; admin and nurse can encode/update.
drop policy if exists patients_select_roles on public.patients;
create policy patients_select_roles
on public.patients
for select
to authenticated
using (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'));

drop policy if exists patients_insert_roles on public.patients;
create policy patients_insert_roles
on public.patients
for insert
to authenticated
with check (public.current_user_role() in ('Admin', 'Nurse'));

drop policy if exists patients_update_roles on public.patients;
create policy patients_update_roles
on public.patients
for update
to authenticated
using (public.current_user_role() in ('Admin', 'Nurse'))
with check (public.current_user_role() in ('Admin', 'Nurse'));

drop policy if exists patients_insert_own on public.patients;
create policy patients_insert_own
on public.patients
for insert
to authenticated
with check (patient_auth_id = auth.uid() and queue_id is null and encoded_by is null);

-- Appointments: admin and doctor full access; patients can create/view their own appointment requests.
drop policy if exists appointments_select_roles on public.appointments;
create policy appointments_select_roles
on public.appointments
for select
to authenticated
using (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'));

drop policy if exists appointments_write_roles on public.appointments;
create policy appointments_write_roles
on public.appointments
for all
to authenticated
using (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'))
with check (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'));

drop policy if exists appointments_select_patient on public.appointments;
create policy appointments_select_patient
on public.appointments
for select
to authenticated
using (patient_auth_id = auth.uid());

drop policy if exists appointments_insert_patient on public.appointments;
create policy appointments_insert_patient
on public.appointments
for insert
to authenticated
with check (patient_auth_id = auth.uid());

-- Medical records: admin and doctor read; nurse and admin can create/update during encoding.
drop policy if exists medical_records_select_roles on public.medical_records;
create policy medical_records_select_roles
on public.medical_records
for select
to authenticated
using (public.current_user_role() in ('Admin', 'Doctor'));

drop policy if exists medical_records_select_patient on public.medical_records;
create policy medical_records_select_patient
on public.medical_records
for select
to authenticated
using (patient_auth_id = auth.uid());

drop policy if exists medical_records_write_roles on public.medical_records;
create policy medical_records_write_roles
on public.medical_records
for all
to authenticated
using (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'))
with check (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'));

drop policy if exists patient_records_select_roles on public.patient_records;
create policy patient_records_select_roles
on public.patient_records
for select
to authenticated
using (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'));

drop policy if exists patient_records_select_patient on public.patient_records;
create policy patient_records_select_patient
on public.patient_records
for select
to authenticated
using (
  patient_auth_id = auth.uid()
  or patient_id in (
    select p.id from public.patients p where p.patient_auth_id = auth.uid()
  )
);

drop policy if exists patient_records_write_roles on public.patient_records;
create policy patient_records_write_roles
on public.patient_records
for all
to authenticated
using (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'))
with check (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'));

-- Inventory: admin, doctor, nurse can read; write access is allowed for all dashboard roles.
drop policy if exists inventory_select_roles on public.inventory_items;
create policy inventory_select_roles
on public.inventory_items
for select
to authenticated
using (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'));

drop policy if exists inventory_write_roles on public.inventory_items;
create policy inventory_write_roles
on public.inventory_items
for all
to authenticated
using (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'))
with check (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'));

drop policy if exists patient_contacts_select_own on public.patient_contacts;
create policy patient_contacts_select_own
on public.patient_contacts
for select
to authenticated
using (id = auth.uid());

drop policy if exists patient_contacts_insert_own on public.patient_contacts;
create policy patient_contacts_insert_own
on public.patient_contacts
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists patient_contacts_update_own on public.patient_contacts;
create policy patient_contacts_update_own
on public.patient_contacts
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists patient_contacts_select_staff on public.patient_contacts;
create policy patient_contacts_select_staff
on public.patient_contacts
for select
to authenticated
using (public.current_user_role() in ('Admin', 'Doctor'));

create or replace function public.purge_archived_data(retention_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz;
  deleted_patient_records integer := 0;
  deleted_queue integer := 0;
  deleted_appointments integer := 0;
begin
  cutoff := now() - make_interval(days => greatest(coalesce(retention_days, 30), 0));

  delete from public.patient_records
  where archived_at is not null
    and archived_at < cutoff;
  get diagnostics deleted_patient_records = row_count;

  delete from public.queue
  where archived_at is not null
    and archived_at < cutoff;
  get diagnostics deleted_queue = row_count;

  delete from public.appointments
  where archived_at is not null
    and archived_at < cutoff;
  get diagnostics deleted_appointments = row_count;

  return jsonb_build_object(
    'cutoff', cutoff,
    'patient_records_deleted', deleted_patient_records,
    'queue_deleted', deleted_queue,
    'appointments_deleted', deleted_appointments
  );
end;
$$;

revoke all on function public.purge_archived_data(integer) from public;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception
    when others then null;
  end;

  begin
    perform cron.unschedule('healthtrack_purge_archives_daily');
  exception
    when others then null;
  end;

  begin
    perform cron.schedule(
      'healthtrack_purge_archives_daily',
      '0 2 * * *',
      $cmd$select public.purge_archived_data(30);$cmd$
    );
  exception
    when others then null;
  end;
end;
$$;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin
on public.audit_logs
for select
to authenticated
using (public.current_user_role() = 'Admin');

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

  actor_role := public.current_user_role();
  if actor_role not in ('Admin', 'Doctor', 'Nurse') then
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

create table if not exists public.service_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.service_types enable row level security;

drop policy if exists service_types_select_authenticated on public.service_types;
create policy service_types_select_authenticated
on public.service_types
for select
to authenticated
using (true);

drop policy if exists service_types_write_admin on public.service_types;
create policy service_types_write_admin
on public.service_types
for all
to authenticated
using (public.current_user_role() = 'Admin')
with check (public.current_user_role() = 'Admin');

insert into public.service_types (code, name, description)
values
  ('animal_bite_anti_rabies', 'Animal Bite / Anti-rabies vaccination', 'Animal bite management and anti-rabies vaccination'),
  ('outpatient_consultation', 'Outpatient Consultation', 'General outpatient consultation services'),
  ('exhumation_cremation_transfer_permit', 'Exhumation / Cremation / Transfer Permit', 'Permits for exhumation, cremation, or transfer'),
  ('review_death_certificate', 'Review of Death Certificate', 'Assistance in reviewing death certificate requirements'),
  ('health_card_issuance', 'Health Card issuance', 'Issuance of health cards'),
  ('medical_certificate_issuance', 'Medical Certificate issuance', 'Issuance of medical certificates'),
  ('sanitary_permit_issuance', 'Sanitary Permit issuance', 'Issuance of sanitary permits'),
  ('tuberculosis_treatment_services', 'Tuberculosis Treatment Services', 'TB treatment and follow-up services'),
  ('pre_marriage_counseling', 'Pre-marriage Counseling', 'Pre-marriage counseling and guidance')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  active = true;

alter table public.appointments add column if not exists service_type_id uuid references public.service_types (id) on delete set null;
alter table public.patient_records add column if not exists service_type_id uuid references public.service_types (id) on delete set null;

-- Pending verifications table + RPCs (email / sms verification)
-- Stores hashed 6-digit codes and supports creation + verification via RPC
create extension if not exists pgcrypto;

create table if not exists public.pending_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  method text not null check (method in ('email','sms')),
  destination text not null,
  code_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified boolean not null default false,
  verified_at timestamptz,
  attempts integer not null default 0
);

create index if not exists pending_verifications_user_method_idx on public.pending_verifications (user_id, method);

-- Create a pending verification and return the plain 6-digit code to the trusted caller.
-- The caller (backend) should deliver the code via email/SMS and must not expose it to clients.
create or replace function public.create_pending_verification(
  p_user_id uuid,
  p_method text,
  p_destination text,
  p_ttl_seconds integer default 600
) returns text language plpgsql security definer as $$
declare
  v_code text := lpad((floor(random() * 900000 + 100000))::int::text, 6, '0');
  v_hash text := encode(digest(v_code, 'sha256'), 'hex');
  v_expires timestamptz := now() + (p_ttl_seconds || ' seconds')::interval;
begin
  insert into public.pending_verifications(user_id, method, destination, code_hash, expires_at)
  values (p_user_id, lower(p_method), p_destination, v_hash, v_expires);
  return v_code;
end;
$$;

-- Verify the supplied code for the given user and method. Returns true when verified.
create or replace function public.verify_pending_code(
  p_user_id uuid,
  p_method text,
  p_code text
) returns boolean language plpgsql security definer as $$
declare
  v_hash text := encode(digest(p_code, 'sha256'), 'hex');
  v_row record;
begin
  select * into v_row from public.pending_verifications
  where user_id = p_user_id and method = lower(p_method) and verified = false and expires_at > now()
  order by created_at desc limit 1;

  if not found then
    return false;
  end if;

  if v_row.code_hash = v_hash then
    update public.pending_verifications set verified = true, verified_at = now() where id = v_row.id;
    -- best-effort: mark profile as verified if a `profiles` table exists
    begin
      if lower(p_method) = 'email' then
        update public.profiles set email_verified = true where id = p_user_id;
      elsif lower(p_method) = 'sms' then
        update public.profiles set phone_verified = true where id = p_user_id;
      end if;
    exception when others then
      null; -- ignore if profiles table doesn't exist
    end;
    return true;
  else
    update public.pending_verifications set attempts = attempts + 1 where id = v_row.id;
    return false;
  end if;
end;
$$;

-- Optional helper to purge expired entries
create or replace function public.purge_expired_pending_verifications(p_older_than_seconds int default 86400) returns integer language plpgsql as $$
declare
  v_cutoff timestamptz := now() - (p_older_than_seconds || ' seconds')::interval;
begin
  delete from public.pending_verifications where expires_at < v_cutoff and verified = false;
  return 1;
end;
$$;

-- Patient Citizen's Charter service enrollment + intake
create table if not exists public.patient_service_enrollments (
  id uuid primary key default gen_random_uuid(),
  patient_auth_id uuid not null references auth.users (id) on delete cascade,
  service_type_id uuid not null references public.service_types (id) on delete restrict,
  status text not null default 'intake_pending'
    check (status in ('active', 'intake_pending', 'intake_completed', 'completed', 'cancelled')),
  intake_required boolean not null default true,
  intake_data jsonb not null default '{}'::jsonb,
  requirements_acknowledged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patient_service_enrollments_patient_idx
  on public.patient_service_enrollments (patient_auth_id, created_at desc);

create unique index if not exists patient_service_enrollments_one_open_per_patient
  on public.patient_service_enrollments (patient_auth_id)
  where status in ('active', 'intake_pending', 'intake_completed');

alter table public.appointments add column if not exists enrollment_id uuid references public.patient_service_enrollments (id) on delete set null;

drop trigger if exists patient_service_enrollments_set_updated_at on public.patient_service_enrollments;
create trigger patient_service_enrollments_set_updated_at
before update on public.patient_service_enrollments
for each row execute function public.set_updated_at();

alter table public.patient_service_enrollments enable row level security;

drop policy if exists patient_service_enrollments_select_patient on public.patient_service_enrollments;
create policy patient_service_enrollments_select_patient
on public.patient_service_enrollments
for select
to authenticated
using (patient_auth_id = auth.uid());

drop policy if exists patient_service_enrollments_insert_patient on public.patient_service_enrollments;
create policy patient_service_enrollments_insert_patient
on public.patient_service_enrollments
for insert
to authenticated
with check (patient_auth_id = auth.uid());

drop policy if exists patient_service_enrollments_update_patient on public.patient_service_enrollments;
create policy patient_service_enrollments_update_patient
on public.patient_service_enrollments
for update
to authenticated
using (patient_auth_id = auth.uid())
with check (patient_auth_id = auth.uid());

drop policy if exists patient_service_enrollments_select_roles on public.patient_service_enrollments;
create policy patient_service_enrollments_select_roles
on public.patient_service_enrollments
for select
to authenticated
using (public.current_user_role() in ('Admin', 'Doctor', 'Nurse'));

drop policy if exists service_types_select_anon on public.service_types;
create policy service_types_select_anon
on public.service_types
for select
to anon
using (active = true);
