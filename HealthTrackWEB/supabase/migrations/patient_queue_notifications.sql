-- Persistent in-app updates for Patient Portal queue and service progress.
create table if not exists public.patient_notifications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients(id) on delete cascade,
  patient_auth_id uuid references auth.users(id) on delete cascade,
  queue_id uuid references public.queue(id) on delete set null,
  service_request_id uuid references public.service_requests(id) on delete set null,
  title text not null,
  message text not null,
  notification_type text not null default 'update',
  created_at timestamptz not null default now()
);

create index if not exists patient_notifications_auth_created_idx
  on public.patient_notifications (patient_auth_id, created_at desc);

alter table public.patient_notifications enable row level security;

drop policy if exists patient_notifications_select_own on public.patient_notifications;
create policy patient_notifications_select_own
on public.patient_notifications
for select
to authenticated
using (patient_auth_id = auth.uid());

create or replace function public.create_patient_notification(
  p_patient_id uuid,
  p_title text,
  p_message text,
  p_notification_type text default 'update',
  p_queue_id uuid default null,
  p_service_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_auth_id uuid;
  notification_id uuid;
begin
  if public.current_user_role() not in ('Doctor', 'Nurse', 'BHW', 'Volunteer') then
    raise exception 'Forbidden';
  end if;

  select patient_auth_id into target_auth_id
  from public.patients
  where id = p_patient_id;

  if target_auth_id is null then
    return null;
  end if;

  insert into public.patient_notifications (
    patient_id, patient_auth_id, queue_id, service_request_id, title, message, notification_type
  ) values (
    p_patient_id, target_auth_id, p_queue_id, p_service_request_id, p_title, p_message, p_notification_type
  ) returning id into notification_id;

  return notification_id;
end;
$$;

revoke all on function public.create_patient_notification(uuid, text, text, text, uuid, uuid) from public;
grant execute on function public.create_patient_notification(uuid, text, text, text, uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'patient_notifications'
     ) then
    alter publication supabase_realtime add table public.patient_notifications;
  end if;
end;
$$;
