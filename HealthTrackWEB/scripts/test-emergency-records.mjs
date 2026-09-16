// Isolated local PostgreSQL regression test. Never reads deployment credentials.
// Usage: node scripts/test-emergency-records.mjs <new-empty-test-cluster-path>
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

const cluster = resolve(process.argv[2] || '')
if (!cluster.startsWith(resolve(tmpdir()) + '\\') || !basename(cluster).startsWith('healthtrack-emergency-')) throw new Error('Expected an isolated healthtrack-emergency-* cluster in TEMP')
const bin = 'C:/Program Files/PostgreSQL/18/bin'
const run = (command, args) => {
  const result = spawnSync(join(bin, command), args, { encoding: 'utf8', windowsHide: true,
    stdio: command === 'pg_ctl.exe' ? 'ignore' : 'pipe', timeout: 90000 })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message)
  return result.stdout
}
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const recordTable = schema.slice(schema.indexOf('create table if not exists public.patient_records ('), schema.indexOf('alter table public.patient_records add column'))
const security = readFileSync(new URL('../supabase/migrations/security_hardening_rls.sql', import.meta.url), 'utf8')
const diagnosisGuard = security.slice(security.indexOf('create or replace function public.enforce_doctor_only_diagnosis()'), security.indexOf('-- 8) email_logs'))
const sql = `
create role authenticated;
create role anon;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create table profiles(id uuid primary key references auth.users, name text, email text, role text, employment_status text);
create function public.current_user_role() returns text language sql stable as $$ select role from profiles where id=auth.uid() $$;
create table patients(id uuid primary key default gen_random_uuid(),name text not null,patient_auth_id uuid references auth.users,
phone text,mobile_phone text,barangay text,municipality text,province text,encoded_by uuid references auth.users,
birthdate date,first_name text,middle_name text,last_name text,sex text,archived_at timestamptz);
create table queue(id uuid primary key default gen_random_uuid(),archived_at timestamptz);
create table appointments(id uuid primary key);
create table service_requests(id uuid primary key default gen_random_uuid(),patient_id uuid references patients,
queue_id uuid references queue,status text,current_status text,intake_data jsonb default '{}',updated_at timestamptz default now());
${recordTable}
${diagnosisGuard}
${readFileSync(new URL('../supabase/migrations/emergency_triage.sql', import.meta.url), 'utf8')}
insert into auth.users values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
insert into profiles values('00000000-0000-0000-0000-000000000001','Test nurse','zuleika.jacosalem@healthtrack.com','Nurse','Active');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
-- Legacy completed direct case is backfilled by the new migration.
insert into emergency_cases(id,patient_name,source,reason,status,vitals,notes)
values('00000000-0000-0000-0000-000000000010','Legacy test','direct','Test incident','completed','{"temp":"","age":""}','Legacy notes');
-- SQL Editor migration has no authenticated application role.
select set_config('request.jwt.claim.sub','',false);
${readFileSync(new URL('../supabase/migrations/emergency_consultation_records.sql', import.meta.url), 'utf8')}
-- Reapplication must not duplicate historical records.
${readFileSync(new URL('../supabase/migrations/emergency_consultation_records.sql', import.meta.url), 'utf8')}
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$
declare p_id uuid; c_id uuid := gen_random_uuid(); r_id uuid; second_id uuid; sr_id uuid; count_records integer;
begin
  select count(*) into count_records from patient_records where emergency_case_id='00000000-0000-0000-0000-000000000010';
  if count_records <> 1 then raise exception 'Legacy backfill is not idempotent'; end if;
  insert into patients(name,patient_auth_id,birthdate) values('Linked test','00000000-0000-0000-0000-000000000002','2000-01-01') returning id into p_id;
  perform encode_emergency_patient(c_id,p_id,'{"patient_name":"Linked test","reason":"Test fever","temp":"39.2","bp":"150/95","age":"26","mobile_phone":"09000000000","municipality":"Other town","province":"Other province","barangay":"Other barangay","spo2":"98","wt":"62.5","ht":"165","pr_hr":"100","rr":"20"}');
  perform encode_emergency_patient(c_id,p_id,'{"patient_name":"Linked test","reason":"Test fever"}');
  begin
    perform complete_emergency_consultation(c_id,'');
    raise exception 'Empty notes accepted';
  exception when others then
    if sqlerrm <> 'Enter assessment and care notes before completing' then raise; end if;
  end;
  if exists(select 1 from patient_records where emergency_case_id=c_id) then raise exception 'Failed completion created record'; end if;
  r_id := complete_emergency_consultation(c_id,'Assessment and care test');
  second_id := complete_emergency_consultation(c_id,'Repeated request');
  if r_id is distinct from second_id then raise exception 'Duplicate record on retry'; end if;
  if not exists(select 1 from patient_records where id=r_id and patient_id=p_id and patient_auth_id='00000000-0000-0000-0000-000000000002'
    and temp=39.2 and spo2=98 and wt=62.5 and ht=165 and age=26 and mobile_phone='09000000000'
    and municipality='Other town' and barangay='Other barangay' and workflow_status='completed' and diagnosis is null
    and notes like '%Emergency nursing assessment%' and notes like '%Assessment and care test%') then raise exception 'Record fields or account linkage missing'; end if;
  begin
    update patient_records set diagnosis='Forbidden nurse diagnosis' where id=r_id;
    raise exception 'Diagnosis protection was bypassed';
  exception when others then
    if sqlerrm <> 'Forbidden: only Doctors may modify diagnosis' then raise; end if;
  end;
  -- BHW referral -> completion -> both record and patient-facing status.
  insert into service_requests(patient_id,status,intake_data) values(p_id,'Encoded','{"staff_encode":{"emergency_manual":true,"first_name":"Linked","last_name":"test","temp":"40"}}') returning id into sr_id;
  select id into c_id from emergency_cases where service_request_id=sr_id;
  r_id := complete_emergency_consultation(c_id,'BHW referral care');
  if not exists(select 1 from service_requests where id=sr_id and status='Completed' and intake_data->>'emergency_status'='completed') then raise exception 'Patient status not synchronized'; end if;
  if not exists(select 1 from patient_records where id=r_id and temp=40 and patient_id=p_id) then raise exception 'BHW record missing'; end if;
  -- New walk-in creates a master profile and staff record without inventing account ownership.
  c_id := encode_emergency_patient(gen_random_uuid(),null,'{"patient_name":"New walk-in","reason":"Accident","municipality":"Pila","barangay":"Pansol"}');
  r_id := complete_emergency_consultation(c_id,'New patient care');
  if not exists(select 1 from patient_records where id=r_id and patient_id is not null and patient_auth_id is null and barangay='Pansol') then raise exception 'New patient record missing'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
  begin
    perform complete_emergency_consultation(c_id,'Unauthorized');
    raise exception 'Unauthorized completion accepted';
  exception when others then
    if sqlerrm <> 'Emergency nurse access required' then raise; end if;
  end;
end $$;
`
const sqlFile = join(cluster, 'emergency-regression.sql')
writeFileSync(sqlFile, sql)
let started = false
try {
  run('pg_ctl.exe', ['-D', cluster, '-l', join(cluster, 'test.log'), '-o', '-p 55439 -h 127.0.0.1', '-w', 'start'])
  started = true
  run('psql.exe', ['-h', '127.0.0.1', '-p', '55439', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', sqlFile])
  console.log('PASS: migrations, legacy backfill, repeat completion, field preservation, account linkage, BHW status sync, new patient creation, access check.')
} finally {
  if (started) run('pg_ctl.exe', ['-D', cluster, '-m', 'fast', '-w', 'stop'])
}
