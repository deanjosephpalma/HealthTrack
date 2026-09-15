-- Apply after bhw_walk_in_encode.sql. Cutoffs must be configured by the RHU nurse.
begin;
create or replace function public.is_emergency_nurse() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid()
    and role = 'Nurse' and employment_status = 'Active'
    and lower(email) = 'zuleika.jacosalem@healthtrack.com');
$$;
revoke all on function public.is_emergency_nurse() from public, anon;
grant execute on function public.is_emergency_nurse() to authenticated;

create table if not exists public.emergency_triage_policy (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  systolic numeric check (systolic > 0),
  diastolic numeric check (diastolic > 0),
  temperature numeric check (temperature > 0),
  check (not enabled or (systolic is not null and diastolic is not null and temperature is not null))
);
insert into public.emergency_triage_policy(id) values(true) on conflict do nothing;
alter table public.emergency_triage_policy enable row level security;
create policy emergency_policy_read on public.emergency_triage_policy for select to authenticated
  using (public.current_user_role() in ('Doctor','Nurse','BHW','Volunteer','Admin'));
create policy emergency_policy_update on public.emergency_triage_policy for update to authenticated
  using (public.is_emergency_nurse()) with check (public.is_emergency_nurse());
grant select, update on public.emergency_triage_policy to authenticated;

create table if not exists public.emergency_cases (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid unique references public.service_requests(id),
  patient_id uuid references public.patients(id),
  patient_name text not null check (length(trim(patient_name)) > 0),
  source text not null check (source in ('bhw','direct')),
  reason text not null check (length(trim(reason)) > 0),
  vitals jsonb not null default '{}',
  status text not null default 'pending' check(status in ('pending','in_care','completed','referred')),
  notes text not null default '',
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.emergency_cases enable row level security;
create policy emergency_cases_read on public.emergency_cases for select to authenticated
  using (public.is_emergency_nurse() or (source = 'bhw' and public.current_user_role() in ('BHW','Volunteer')));
create policy emergency_cases_insert on public.emergency_cases for insert to authenticated
  with check (public.is_emergency_nurse() and source = 'direct' and created_by = auth.uid() and service_request_id is null);
grant select, insert on public.emergency_cases to authenticated;

create or replace function public.update_emergency_case(p_id uuid, p_status text, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_emergency_nurse() then raise exception 'Emergency nurse access required'; end if;
  if p_status not in ('pending','in_care','completed','referred') then raise exception 'Invalid status'; end if;
  update public.emergency_cases set status=p_status, notes=coalesce(p_notes,''), updated_at=now() where id=p_id;
  if not found then raise exception 'Case not found'; end if;
end;
$$;
revoke all on function public.update_emergency_case(uuid,text,text) from public, anon;
grant execute on function public.update_emergency_case(uuid,text,text) to authenticated;

create or replace function public.detect_emergency_intake() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.emergency_triage_policy;
  v jsonb;
  bp text[];
  reasons text[] := '{}';
begin
  if exists(select 1 from public.emergency_cases where service_request_id=new.id) then
    new.intake_data := jsonb_set(coalesce(new.intake_data,'{}'),'{emergency_referred}','true');
    if new.queue_id is not null or new.status = 'In Queue' then raise exception 'Emergency patient must bypass the regular queue'; end if;
    return new;
  end if;
  new.intake_data := coalesce(new.intake_data,'{}') - 'emergency_referred';
  if new.status <> 'Encoded' then return new; end if;
  if coalesce(public.current_user_role(),'') not in ('BHW','Volunteer','Nurse','Doctor','Admin') then return new; end if;
  v := new.intake_data->'staff_encode';
  if v->>'emergency_manual' = 'true' then
    if new.queue_id is not null or exists(select 1 from public.queue where service_request_id=new.id and archived_at is null) then
      raise exception 'Patient already has a queue ticket; contact the emergency nurse';
    end if;
    new.intake_data := jsonb_set(new.intake_data,'{emergency_referred}','true');
    return new;
  end if;
  select * into p from public.emergency_triage_policy where id;
  if not coalesce(p.enabled,false) then return new; end if;
  v := new.intake_data->'staff_encode';
  bp := regexp_match(coalesce(v->>'bp',''), '^\s*([0-9]{2,3})\s*/\s*([0-9]{2,3})\s*$');
  if bp is not null and (bp[1]::numeric >= p.systolic or bp[2]::numeric >= p.diastolic) then
    reasons := array_append(reasons,'High BP: ' || (v->>'bp') || ' mmHg');
  end if;
  if trim(coalesce(v->>'temp','')) ~ '^[0-9]+(\.[0-9]+)?$' then
    if (v->>'temp')::numeric >= p.temperature then
      reasons := array_append(reasons,'High temperature: ' || (v->>'temp') || ' °C');
    end if;
  end if;
  if cardinality(reasons)>0 then
    if new.queue_id is not null or exists(select 1 from public.queue where service_request_id=new.id and archived_at is null) then raise exception 'Patient already has a queue ticket; contact the emergency nurse'; end if;
    new.intake_data := jsonb_set(coalesce(new.intake_data,'{}'),'{emergency_referred}','true');
  end if;
  return new;
end;
$$;

-- AFTER trigger ensures the request exists before inserting the case's foreign key.
create or replace function public.persist_emergency_intake() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.intake_data->>'emergency_referred' = 'true' then
    insert into public.emergency_cases(service_request_id,patient_id,patient_name,source,reason,vitals)
    values(new.id,new.patient_id,
      coalesce(nullif(trim(concat_ws(' ',new.intake_data#>>'{staff_encode,first_name}',new.intake_data#>>'{staff_encode,last_name}')),''),'Patient'),
      'bhw',case when new.intake_data#>>'{staff_encode,emergency_manual}' = 'true' then 'Urgent BHW referral — immediate nurse assessment' else 'Elevated vital signs — immediate nurse assessment' end,coalesce(new.intake_data->'staff_encode','{}'))
    on conflict(service_request_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger detect_emergency_intake before insert or update on public.service_requests
for each row execute function public.detect_emergency_intake();
create trigger persist_emergency_intake after insert or update on public.service_requests
for each row execute function public.persist_emergency_intake();

create or replace function public.block_emergency_queue() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.service_request_id is not null then
    perform 1 from public.service_requests where id=new.service_request_id for update;
    if exists(select 1 from public.emergency_cases where service_request_id=new.service_request_id) then
      raise exception 'Emergency patient must bypass the regular queue';
    end if;
  end if;
  return new;
end;
$$;
create trigger block_emergency_queue before insert or update on public.queue
for each row execute function public.block_emergency_queue();
commit;
