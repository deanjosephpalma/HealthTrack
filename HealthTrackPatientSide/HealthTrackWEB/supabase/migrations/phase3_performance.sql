-- Phase 3 performance & reliability (apply after phase2_security_fixes.sql)
-- 1) HeatMap aggregation RPC (Laravel API + optional UI)
-- 2) Atomic queue number allocator + uniqueness per service/day
-- 3) Supporting indexes for today-scoped queue pulls

-- ---------------------------------------------------------------------------
-- Heat map: barangay × disease counts from patient_records (Pila)
-- ---------------------------------------------------------------------------
create or replace function public.heatmap_pila_disease_counts(
  p_disease text default null,
  p_barangay text default null
)
returns table (
  barangay text,
  disease text,
  count bigint,
  lat double precision,
  lng double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    nullif(trim(pr.barangay), '')::text as barangay,
    nullif(trim(pr.diagnosis), '')::text as disease,
    count(*)::bigint as count,
    avg(pr.latitude)::double precision as lat,
    avg(pr.longitude)::double precision as lng
  from public.patient_records pr
  where pr.archived_at is null
    and nullif(trim(pr.barangay), '') is not null
    and nullif(trim(pr.diagnosis), '') is not null
    and (
      pr.municipality is null
      or lower(trim(pr.municipality)) in ('pila', 'n/a', '')
      or pr.municipality ilike 'pila%'
    )
    and (
      p_disease is null
      or trim(p_disease) = ''
      or pr.diagnosis ilike ('%' || trim(p_disease) || '%')
    )
    and (
      p_barangay is null
      or trim(p_barangay) = ''
      or pr.barangay ilike ('%' || trim(p_barangay) || '%')
    )
  group by 1, 2
  order by count desc;
$$;

revoke all on function public.heatmap_pila_disease_counts(text, text) from public;
grant execute on function public.heatmap_pila_disease_counts(text, text) to authenticated;
grant execute on function public.heatmap_pila_disease_counts(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Queue day counter + atomic next number (fixes max+1 races)
-- ---------------------------------------------------------------------------
create table if not exists public.queue_daily_counters (
  service_code text not null,
  queue_day date not null,
  last_number integer not null default 0,
  primary key (service_code, queue_day)
);

create or replace function public.next_queue_number(p_service_code text default 'RHU')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := coalesce(nullif(trim(p_service_code), ''), 'RHU');
  v_day date := (timezone('Asia/Manila', now()))::date;
  v_next integer;
begin
  insert into public.queue_daily_counters (service_code, queue_day, last_number)
  values (v_code, v_day, 1)
  on conflict (service_code, queue_day)
  do update set last_number = public.queue_daily_counters.last_number + 1
  returning last_number into v_next;

  return v_next;
end;
$$;

revoke all on function public.next_queue_number(text) from public;
grant execute on function public.next_queue_number(text) to authenticated;
grant execute on function public.next_queue_number(text) to service_role;

-- Seed counters from existing today rows so next allocation continues the sequence
insert into public.queue_daily_counters (service_code, queue_day, last_number)
select
  coalesce(nullif(trim(q.service_code), ''), 'RHU') as service_code,
  (timezone('Asia/Manila', q.created_at))::date as queue_day,
  max(q.queue_number)::integer as last_number
from public.queue q
where q.queue_number is not null
group by 1, 2
on conflict (service_code, queue_day)
do update set last_number = greatest(
  public.queue_daily_counters.last_number,
  excluded.last_number
);

-- Resolve duplicate queue numbers before unique index (keep earliest row; bump later dups)
do $$
declare
  r record;
  max_n integer;
begin
  for r in
    select id, service_code, day, rn
    from (
      select
        id,
        coalesce(nullif(trim(service_code), ''), 'RHU') as service_code,
        (timezone('Asia/Manila', created_at))::date as day,
        row_number() over (
          partition by
            coalesce(nullif(trim(service_code), ''), 'RHU'),
            (timezone('Asia/Manila', created_at))::date,
            queue_number
          order by created_at nulls first, id
        ) as rn
      from public.queue
      where queue_number is not null
    ) d
    where rn > 1
  loop
    select coalesce(max(queue_number), 0) into max_n
    from public.queue
    where coalesce(nullif(trim(service_code), ''), 'RHU') = r.service_code
      and (timezone('Asia/Manila', created_at))::date = r.day;

    update public.queue
    set queue_number = max_n + 1
    where id = r.id;

    insert into public.queue_daily_counters (service_code, queue_day, last_number)
    values (r.service_code, r.day, max_n + 1)
    on conflict (service_code, queue_day)
    do update set last_number = greatest(public.queue_daily_counters.last_number, excluded.last_number);
  end loop;
end $$;

create unique index if not exists queue_service_day_number_uidx
on public.queue (
  coalesce(nullif(trim(service_code), ''), 'RHU'),
  ((timezone('Asia/Manila', created_at))::date),
  queue_number
)
where queue_number is not null;

create index if not exists queue_created_at_idx
on public.queue (created_at desc);

create index if not exists queue_service_created_idx
on public.queue (service_code, created_at desc);

create index if not exists patient_records_created_at_idx
on public.patient_records (created_at desc);

create index if not exists patient_records_heatmap_idx
on public.patient_records (municipality, barangay, created_at desc)
where archived_at is null and diagnosis is not null;
