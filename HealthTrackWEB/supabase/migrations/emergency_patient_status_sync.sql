-- Apply after emergency_triage_queue_link_fix.sql. Safe to rerun.
-- Mirrors only workflow status; clinical notes remain in the staff-only case table.
begin;
create or replace function public.detect_emergency_intake() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.emergency_triage_policy;
  emergency_status text;
  v jsonb;
  bp text[];
  reasons text[] := '{}';
begin
  select status into emergency_status from public.emergency_cases where service_request_id=new.id;
  if found then
    new.intake_data := jsonb_set(coalesce(new.intake_data,'{}'),'{emergency_referred}','true');
    if new.queue_id is not null or new.status = 'In Queue' then raise exception 'Emergency patient must bypass the regular queue'; end if;
    new.intake_data := new.intake_data || jsonb_build_object('emergency_status', emergency_status);
    new.status := case when emergency_status in ('completed','referred') then 'Completed' else 'In Progress' end;
    new.current_status := case when emergency_status in ('completed','referred') then 'completed' else 'in_progress' end;
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

-- Keep the patient-facing request synchronized in the same transaction as nurse care.
create or replace function public.sync_emergency_request_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.service_request_id is not null then
    update public.service_requests set updated_at = new.updated_at
    where id = new.service_request_id;
  end if;
  return new;
end;
$$;
drop trigger if exists sync_emergency_request_status on public.emergency_cases;
create trigger sync_emergency_request_status after insert or update of status on public.emergency_cases
for each row execute function public.sync_emergency_request_status();

-- Repair already consulted/referred patients as well as pending emergency visits.
update public.service_requests sr
set updated_at = ec.updated_at
from public.emergency_cases ec
where ec.service_request_id = sr.id;
notify pgrst, 'reload schema';
commit;
