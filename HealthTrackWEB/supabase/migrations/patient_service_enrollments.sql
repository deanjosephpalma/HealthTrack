-- Citizen's Charter: patient service enrollments + appointment link
-- Run in Supabase Dashboard → SQL Editor, or: npm run apply:charter-migration (requires DATABASE_URL in .env.seed)

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
