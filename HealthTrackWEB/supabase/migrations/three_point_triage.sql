-- Three-level adult triage decision support. Review all defaults with the RHU clinician.
-- RED bypasses the queue, YELLOW receives queue priority, GREEN uses the regular queue.
begin;

alter table public.emergency_triage_policy
  add column if not exists low_systolic numeric check (low_systolic > 0),
  add column if not exists yellow_systolic numeric check (yellow_systolic > 0),
  add column if not exists yellow_diastolic numeric check (yellow_diastolic > 0),
  add column if not exists yellow_temperature numeric check (yellow_temperature > 0);

update public.emergency_triage_policy set
  low_systolic = coalesce(low_systolic, 90),
  yellow_systolic = coalesce(yellow_systolic, 140),
  yellow_diastolic = coalesce(yellow_diastolic, 90),
  yellow_temperature = coalesce(yellow_temperature, 38)
where id;

alter table public.emergency_triage_policy
  alter column low_systolic set default 90,
  alter column yellow_systolic set default 140,
  alter column yellow_diastolic set default 90,
  alter column yellow_temperature set default 38;

create or replace function public.detect_emergency_intake() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  p public.emergency_triage_policy;
  emergency_status text;
  v jsonb;
  bp text[];
  red_reasons text[] := '{}';
  yellow_reasons text[] := '{}';
  triage_level text := 'green';
begin
  select status into emergency_status from public.emergency_cases where service_request_id=new.id;
  if found then
    new.intake_data := coalesce(new.intake_data,'{}') || jsonb_build_object(
      'emergency_referred', true, 'triage_level', 'red', 'emergency_status', emergency_status);
    if new.queue_id is not null or new.status = 'In Queue' then raise exception 'RED patient must bypass the regular queue'; end if;
    new.status := case when emergency_status in ('completed','referred') then 'Completed' else 'In Progress' end;
    new.current_status := case when emergency_status in ('completed','referred') then 'completed' else 'in_progress' end;
    return new;
  end if;

  new.intake_data := coalesce(new.intake_data,'{}') - 'emergency_referred';
  if new.status <> 'Encoded' then return new; end if;
  if coalesce(public.current_user_role(),'') not in ('BHW','Volunteer','Nurse','Doctor','Admin') then return new; end if;
  v := new.intake_data->'staff_encode';

  if v->>'emergency_manual' = 'true' then
    red_reasons := array_append(red_reasons, 'Manual urgent referral');
  end if;

  select * into p from public.emergency_triage_policy where id;
  if coalesce(p.enabled,false) then
    bp := regexp_match(coalesce(v->>'bp',''), '^\s*([0-9]{2,3})\s*/\s*([0-9]{2,3})\s*$');
    if bp is not null and p.low_systolic is not null and bp[1]::numeric <= p.low_systolic then
      red_reasons := array_append(red_reasons,'Low BP: ' || (v->>'bp') || ' mmHg');
    end if;
    if bp is not null and (bp[1]::numeric >= p.systolic or bp[2]::numeric >= p.diastolic) then
      red_reasons := array_append(red_reasons,'High BP: ' || (v->>'bp') || ' mmHg');
    elsif bp is not null and p.yellow_systolic is not null and p.yellow_diastolic is not null
      and (bp[1]::numeric >= p.yellow_systolic or bp[2]::numeric >= p.yellow_diastolic) then
      yellow_reasons := array_append(yellow_reasons,'Elevated BP: ' || (v->>'bp') || ' mmHg');
    end if;
    if trim(coalesce(v->>'temp','')) ~ '^[0-9]+(\.[0-9]+)?$' then
      if (v->>'temp')::numeric >= p.temperature then
        red_reasons := array_append(red_reasons,'High temperature: ' || (v->>'temp') || ' °C');
      elsif p.yellow_temperature is not null and (v->>'temp')::numeric >= p.yellow_temperature then
        yellow_reasons := array_append(yellow_reasons,'Elevated temperature: ' || (v->>'temp') || ' °C');
      end if;
    end if;
  end if;

  if cardinality(red_reasons) > 0 then
    triage_level := 'red';
    if new.queue_id is not null or exists(select 1 from public.queue where service_request_id=new.id and archived_at is null) then
      raise exception 'RED patient already has a queue ticket; contact the emergency nurse';
    end if;
    new.intake_data := new.intake_data || jsonb_build_object('emergency_referred', true);
  elsif cardinality(yellow_reasons) > 0 then
    triage_level := 'yellow';
    new.intake_data := new.intake_data || jsonb_build_object('is_priority', true, 'priority_labels', 'Yellow triage');
  end if;

  new.intake_data := new.intake_data || jsonb_build_object(
    'triage_level', triage_level,
    'triage_reasons', to_jsonb(case when triage_level = 'red' then red_reasons when triage_level = 'yellow' then yellow_reasons else array[]::text[] end),
    'triaged_at', now(), 'triaged_by', 'automatic');
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
