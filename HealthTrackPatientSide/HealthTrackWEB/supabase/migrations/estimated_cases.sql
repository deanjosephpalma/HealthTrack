-- Ensure estimated_cases (Reported Cases) exists + staff can manage rows for Heat Map

create table if not exists public.estimated_cases (
  id uuid primary key default gen_random_uuid(),
  disease text not null,
  barangay text not null,
  estimated_count integer not null check (estimated_count > 0),
  status text not null check (status in ('suspected', 'estimated', 'community-reported')),
  latitude numeric,
  longitude numeric,
  reported_by uuid references auth.users (id) on delete set null,
  report_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.estimated_cases enable row level security;

drop policy if exists estimated_cases_insert on public.estimated_cases;
create policy estimated_cases_insert
on public.estimated_cases
for insert
to authenticated
with check (true);

drop policy if exists estimated_cases_select on public.estimated_cases;
create policy estimated_cases_select
on public.estimated_cases
for select
to authenticated
using (true);

drop policy if exists estimated_cases_update on public.estimated_cases;
create policy estimated_cases_update
on public.estimated_cases
for update
to authenticated
using (true)
with check (true);

drop policy if exists estimated_cases_delete on public.estimated_cases;
create policy estimated_cases_delete
on public.estimated_cases
for delete
to authenticated
using (true);

-- updated_at trigger (no-op if function missing)
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'set_updated_at' and n.nspname = 'public'
  ) then
    drop trigger if exists set_estimated_cases_updated_at on public.estimated_cases;
    create trigger set_estimated_cases_updated_at
    before update on public.estimated_cases
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- Realtime (ignore if already added)
do $$
begin
  alter publication supabase_realtime add table public.estimated_cases;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
