-- Repair existing installations of emergency_triage.sql.
-- Safe to rerun. Apply before deploying the updated queue sync client.
begin;

alter table public.queue
  add column if not exists service_request_id uuid
  references public.service_requests(id) on delete set null;

create index if not exists queue_service_request_id_idx
  on public.queue(service_request_id);

-- Backfill only unambiguous existing links; preserve any already stored link.
update public.queue q
set service_request_id = links.request_id
from (
  select queue_id, (array_agg(id))[1] as request_id
  from public.service_requests
  where queue_id is not null
  group by queue_id
  having count(*) = 1
) links
where q.id = links.queue_id and q.service_request_id is null;

notify pgrst, 'reload schema';
commit;
