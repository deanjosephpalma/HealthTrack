-- Soft-archive for service_requests (workflows), matching appointments/queue/records

alter table public.service_requests
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id) on delete set null;

create index if not exists service_requests_archived_at_idx
  on public.service_requests (archived_at);

-- Extend purge to include archived workflows (30-day retention)
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
  deleted_service_requests integer := 0;
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

  delete from public.service_requests
  where archived_at is not null
    and archived_at < cutoff;
  get diagnostics deleted_service_requests = row_count;

  return jsonb_build_object(
    'cutoff', cutoff,
    'patient_records_deleted', deleted_patient_records,
    'queue_deleted', deleted_queue,
    'appointments_deleted', deleted_appointments,
    'service_requests_deleted', deleted_service_requests
  );
end;
$$;

revoke all on function public.purge_archived_data(integer) from public;
