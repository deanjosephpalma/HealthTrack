-- Staff employment status. Resigned staff are excluded from the effective role
-- used by RLS, so an existing browser token cannot access protected data.
alter table public.profiles
  add column if not exists employment_status text not null default 'Active';

alter table public.profiles
  drop constraint if exists profiles_employment_status_check;

alter table public.profiles
  add constraint profiles_employment_status_check
  check (employment_status in ('Active', 'Resigned'));

create index if not exists profiles_employment_status_idx
  on public.profiles (employment_status);

create or replace function public.current_user_role()
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.role
      from public.profiles p
      where p.id = auth.uid()
        and p.employment_status = 'Active'
    ),
    ''
  )
$$;
