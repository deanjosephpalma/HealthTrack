-- Offline queueing: link service_requests to queue, allow patient self-join

alter table public.service_requests
  add column if not exists queue_id uuid references public.queue (id) on delete set null;

create index if not exists service_requests_queue_id_idx
  on public.service_requests (queue_id);

-- Allow broader queue statuses used by the apps (if check constraint exists, recreate softly)
do $$
begin
  alter table public.queue drop constraint if exists queue_status_check;
exception when undefined_object then
  null;
end $$;

alter table public.queue
  drop constraint if exists queue_status_check;

alter table public.queue
  add constraint queue_status_check
  check (
    status is null
    or status in (
      'waiting',
      'next',
      'called',
      'skipped',
      'completed',
      'done',
      'cancelled',
      'in_progress'
    )
  );

-- Patient SELECT: own tickets via patients.patient_auth_id
drop policy if exists queue_select_patient on public.queue;
create policy queue_select_patient
  on public.queue
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.patients p
      where p.id = queue.patient_id
        and p.patient_auth_id = auth.uid()
    )
    or exists (
      select 1
      from public.appointments a
      where a.id = queue.appointment_id
        and a.patient_auth_id = auth.uid()
    )
  );

-- Patient INSERT: self-join with patient_id belonging to caller
drop policy if exists queue_insert_patient on public.queue;
create policy queue_insert_patient
  on public.queue
  for insert
  to authenticated
  with check (
    patient_id is null
    or exists (
      select 1
      from public.patients p
      where p.id = patient_id
        and p.patient_auth_id = auth.uid()
    )
  );

-- Patient UPDATE own rows (status visibility sync only; staff remain primary)
drop policy if exists queue_update_patient on public.queue;
create policy queue_update_patient
  on public.queue
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.patients p
      where p.id = queue.patient_id
        and p.patient_auth_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.patients p
      where p.id = queue.patient_id
        and p.patient_auth_id = auth.uid()
    )
  );

-- Keep existing staff/mobile insert policies; ensure anon insert for kiosk remains if present
-- (queue_insert_mobile already allows authenticated/anon in schema.sql)
