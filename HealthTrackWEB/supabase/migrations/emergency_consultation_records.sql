-- Apply after emergency_patient_status_sync.sql. Safe to rerun.
-- Nursing assessment belongs in notes; diagnosis remains reserved for Doctors.
begin;
alter table public.patient_records add column if not exists emergency_case_id uuid
  references public.emergency_cases(id) on delete set null;
create unique index if not exists patient_records_emergency_case_unique
  on public.patient_records(emergency_case_id);

-- Numeric intake fields may be blank or absent in older cases.
create or replace function public.emergency_numeric(value text) returns numeric
language sql immutable set search_path = public as $$
  select case when trim(value) ~ '^[0-9]+(\.[0-9]+)?$' then trim(value)::numeric else null end;
$$;

create or replace function public.create_emergency_patient_record(p_case_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c public.emergency_cases;
  p public.patients;
  v jsonb;
  record_id uuid;
begin
  select * into c from public.emergency_cases where id=p_case_id for update;
  if not found then raise exception 'Emergency case not found'; end if;
  if c.status not in ('completed','referred') then return null; end if;
  select id into record_id from public.patient_records where emergency_case_id=c.id;
  if found then return record_id; end if;

  if c.patient_id is null and c.service_request_id is not null then
    select patient_id into c.patient_id from public.service_requests where id=c.service_request_id;
  end if;
  if c.patient_id is not null then
    select * into p from public.patients where id=c.patient_id;
    if not found then raise exception 'Linked patient not found'; end if;
  else
    -- Legacy unidentified/direct cases still need a staff-visible patient record.
    insert into public.patients(name,phone,mobile_phone,barangay,municipality,province,encoded_by)
    values(c.patient_name,nullif(c.vitals->>'mobile_phone',''),nullif(c.vitals->>'mobile_phone',''),
      nullif(c.vitals->>'barangay',''),coalesce(nullif(c.vitals->>'municipality',''),'Pila'),
      coalesce(nullif(c.vitals->>'province',''),'Laguna'),c.created_by) returning * into p;
    c.patient_id := p.id;
  end if;
  update public.emergency_cases set patient_id=c.patient_id where id=c.id and patient_id is distinct from c.patient_id;
  v := jsonb_strip_nulls(to_jsonb(p)) || coalesce(c.vitals,'{}');
  insert into public.patient_records(
    emergency_case_id,patient_id,patient_auth_id,patient_name,first_name,middle_name,last_name,
    age,sex,birthdate,mobile_phone,barangay,municipality,province,
    date_of_consultation,bp,temp,pr_hr,rr,spo2,wt,ht,waist,hip,
    notes,workflow_status,nurse_completed_at,created_by
  ) values (
    c.id,p.id,p.patient_auth_id,c.patient_name,v->>'first_name',v->>'middle_name',v->>'last_name',
    coalesce(public.emergency_numeric(v->>'age')::integer,
      case when p.birthdate is not null then extract(year from age(c.created_at::date,p.birthdate))::integer end),
    v->>'sex',p.birthdate,coalesce(nullif(v->>'mobile_phone',''),p.phone),v->>'barangay',
    coalesce(nullif(v->>'municipality',''),'Pila'),coalesce(nullif(v->>'province',''),'Laguna'),
    (c.updated_at at time zone 'Asia/Manila')::date,v->>'bp',public.emergency_numeric(v->>'temp'),
    v->>'pr_hr',v->>'rr',public.emergency_numeric(v->>'spo2'),public.emergency_numeric(v->>'wt'),
    public.emergency_numeric(v->>'ht'),public.emergency_numeric(v->>'waist'),public.emergency_numeric(v->>'hip'),
    concat_ws(E'\n\n','Emergency nursing assessment','Reason: ' || c.reason,nullif(c.notes,'')),
    'completed',c.updated_at,coalesce(auth.uid(),c.created_by)
  ) returning id into record_id;
  return record_id;
end;
$$;
revoke all on function public.create_emergency_patient_record(uuid) from public,anon,authenticated;

create or replace function public.persist_completed_emergency_record() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform public.create_emergency_patient_record(new.id);
  return new;
end;
$$;
drop trigger if exists persist_completed_emergency_record on public.emergency_cases;
create trigger persist_completed_emergency_record after insert or update of status on public.emergency_cases
for each row execute function public.persist_completed_emergency_record();

create or replace function public.complete_emergency_consultation(p_id uuid,p_notes text) returns uuid
language plpgsql security definer set search_path=public as $$
declare record_id uuid;
begin
  if not public.is_emergency_nurse() then raise exception 'Emergency nurse access required'; end if;
  perform 1 from public.emergency_cases where id=p_id for update;
  if not found then raise exception 'Emergency case not found'; end if;
  select id into record_id from public.patient_records where emergency_case_id=p_id;
  if found then return record_id; end if;
  if nullif(trim(p_notes),'') is null then raise exception 'Enter assessment and care notes before completing'; end if;
  update public.emergency_cases set status='completed',notes=trim(p_notes),updated_at=now() where id=p_id;
  select id into record_id from public.patient_records where emergency_case_id=p_id;
  return record_id;
end;
$$;
revoke all on function public.complete_emergency_consultation(uuid,text) from public,anon;
grant execute on function public.complete_emergency_consultation(uuid,text) to authenticated;

create or replace function public.encode_emergency_patient(p_case_id uuid,p_patient_id uuid,p_data jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare p public.patients; existing public.emergency_cases;
begin
  if not public.is_emergency_nurse() then raise exception 'Emergency nurse access required'; end if;
  if p_case_id is null then raise exception 'Case identifier required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_case_id::text,0));
  select * into existing from public.emergency_cases where id=p_case_id;
  if found then
    if existing.created_by=auth.uid() and existing.source='direct' then return existing.id; end if;
    raise exception 'Case identifier already used';
  end if;
  if nullif(trim(p_data->>'patient_name'),'') is null or nullif(trim(p_data->>'reason'),'') is null then
    raise exception 'Patient name and emergency reason are required';
  end if;
  if p_patient_id is not null then
    select * into p from public.patients where id=p_patient_id and archived_at is null;
    if not found then raise exception 'Selected patient no longer available'; end if;
  else
    insert into public.patients(name,phone,mobile_phone,barangay,municipality,province,encoded_by)
    values(trim(p_data->>'patient_name'),nullif(p_data->>'mobile_phone',''),nullif(p_data->>'mobile_phone',''),
      nullif(p_data->>'barangay',''),coalesce(nullif(p_data->>'municipality',''),'Pila'),
      coalesce(nullif(p_data->>'province',''),'Laguna'),auth.uid()) returning * into p;
  end if;
  insert into public.emergency_cases(id,patient_id,patient_name,source,reason,vitals,notes)
  values(p_case_id,p.id,case when p_patient_id is not null then p.name else trim(p_data->>'patient_name') end,
    'direct',trim(p_data->>'reason'),p_data - 'notes' - 'reason' - 'patient_name',coalesce(p_data->>'notes',''));
  return p_case_id;
end;
$$;
revoke all on function public.encode_emergency_patient(uuid,uuid,jsonb) from public,anon;
grant execute on function public.encode_emergency_patient(uuid,uuid,jsonb) to authenticated;

-- Include consultations completed before record creation was implemented.
do $$ declare c record; begin
  for c in select id from public.emergency_cases where status in ('completed','referred') loop
    perform public.create_emergency_patient_record(c.id);
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
