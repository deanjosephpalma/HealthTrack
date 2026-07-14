-- Phase 1 critical fixes (apply in Supabase SQL Editor after security_hardening_rls.sql)
-- 1) Patients cannot forge released certificates/permits
-- 2) Patients cannot UPDATE queue status
-- 3) Strip remaining Admin from key staff policies / role CHECK stays for legacy rows but policies ignore Admin
-- 4) OTP verify must bind to auth.uid(); set search_path on verification RPCs

-- ---------------------------------------------------------------------------
-- Certificates / permits: patients SELECT only (no INSERT of released docs)
-- ---------------------------------------------------------------------------
drop policy if exists certificates_patient_insert on public.certificates;
drop policy if exists permits_patient_insert on public.permits;

-- ---------------------------------------------------------------------------
-- Queue: remove patient UPDATE (staff-only status changes)
-- ---------------------------------------------------------------------------
drop policy if exists queue_update_patient on public.queue;

-- Tighten patient insert: must own patient_id (no null spoof)
drop policy if exists queue_insert_patient on public.queue;
create policy queue_insert_patient
on public.queue
for insert
to authenticated
with check (
  patient_id is not null
  and public.is_patient_owner(patient_id)
);

-- ---------------------------------------------------------------------------
-- Remaining Admin in RHU workflow sibling policies -> Doctor/Nurse only
-- ---------------------------------------------------------------------------
do $$
declare
  pol record;
begin
  -- Re-assert staff-only policies on common RHU tables if they exist
  if to_regclass('public.service_requests') is not null then
    execute 'drop policy if exists service_requests_staff on public.service_requests';
    begin
      execute $p$
        create policy service_requests_staff
        on public.service_requests for all to authenticated
        using (public.is_staff_role())
        with check (public.is_staff_role())
      $p$;
    exception when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.service_request_steps') is not null then
    execute 'drop policy if exists service_request_steps_staff on public.service_request_steps';
    begin
      execute $p$
        create policy service_request_steps_staff
        on public.service_request_steps for all to authenticated
        using (public.is_staff_role())
        with check (public.is_staff_role())
      $p$;
    exception when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.workflow_status_logs') is not null then
    execute 'drop policy if exists workflow_logs_staff on public.workflow_status_logs';
    begin
      execute $p$
        create policy workflow_logs_staff
        on public.workflow_status_logs for all to authenticated
        using (public.is_staff_role())
        with check (public.is_staff_role())
      $p$;
    exception when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.form_responses') is not null then
    execute 'drop policy if exists "Allow all on form_responses" on public.form_responses';
    execute 'drop policy if exists form_responses_staff on public.form_responses';
    begin
      execute $p$
        create policy form_responses_staff
        on public.form_responses for all to authenticated
        using (public.is_staff_role())
        with check (public.is_staff_role())
      $p$;
    exception when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.form_fields') is not null then
    execute 'drop policy if exists "Allow all on form_fields" on public.form_fields';
    execute 'drop policy if exists form_fields_staff on public.form_fields';
    begin
      execute $p$
        create policy form_fields_staff
        on public.form_fields for select to authenticated
        using (public.is_staff_role())
      $p$;
    exception when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.workflow_steps') is not null then
    execute 'drop policy if exists "Allow all on workflow_steps" on public.workflow_steps';
    execute 'drop policy if exists workflow_steps_staff on public.workflow_steps';
    begin
      execute $p$
        create policy workflow_steps_staff
        on public.workflow_steps for select to authenticated
        using (public.is_staff_role())
      $p$;
    exception when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.services') is not null then
    execute 'drop policy if exists "Allow all on services" on public.services';
    execute 'drop policy if exists services_staff_select on public.services';
    begin
      execute $p$
        create policy services_staff_select
        on public.services for select to authenticated
        using (true)
      $p$;
    exception when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.tb_monitoring') is not null then
    execute 'drop policy if exists tb_monitoring_staff on public.tb_monitoring';
    begin
      execute $p$
        create policy tb_monitoring_staff
        on public.tb_monitoring for all to authenticated
        using (public.is_staff_role())
        with check (public.is_staff_role())
      $p$;
    exception when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.animal_bite_doses') is not null then
    execute 'drop policy if exists animal_bite_doses_staff on public.animal_bite_doses';
    begin
      execute $p$
        create policy animal_bite_doses_staff
        on public.animal_bite_doses for all to authenticated
        using (public.is_staff_role())
        with check (public.is_staff_role())
      $p$;
    exception when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.patient_service_enrollments') is not null then
    execute 'drop policy if exists patient_service_enrollments_select_roles on public.patient_service_enrollments';
    begin
      execute $p$
        create policy patient_service_enrollments_select_roles
        on public.patient_service_enrollments for select to authenticated
        using (public.is_staff_role() or patient_auth_id = auth.uid())
      $p$;
    exception when duplicate_object then null;
    end;
  end if;

  if to_regclass('public.medical_records') is not null then
    execute 'drop policy if exists medical_records_write_roles on public.medical_records';
    begin
      execute $p$
        create policy medical_records_write_roles
        on public.medical_records for all to authenticated
        using (public.is_staff_role())
        with check (public.is_staff_role())
      $p$;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- Doctor-only diagnosis on medical_records if diagnosis column exists
do $$
begin
  if to_regclass('public.medical_records') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'medical_records' and column_name = 'diagnosis'
     ) then
    execute $fn$
      create or replace function public.enforce_doctor_only_diagnosis_medical()
      returns trigger
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        role text := public.current_user_role();
      begin
        if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then
          return new;
        end if;
        if role = 'Doctor' then
          return new;
        end if;
        if role = 'Nurse' then
          if tg_op = 'INSERT' and nullif(trim(coalesce(new.diagnosis, '')), '') is not null then
            raise exception 'Forbidden: only Doctors may set diagnosis';
          end if;
          if tg_op = 'UPDATE' and coalesce(new.diagnosis, '') is distinct from coalesce(old.diagnosis, '') then
            raise exception 'Forbidden: only Doctors may modify diagnosis';
          end if;
        end if;
        return new;
      end;
      $body$;
    $fn$;

    execute 'drop trigger if exists enforce_doctor_only_diagnosis_medical_trg on public.medical_records';
    execute 'create trigger enforce_doctor_only_diagnosis_medical_trg before insert or update on public.medical_records for each row execute function public.enforce_doctor_only_diagnosis_medical()';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- OTP verify: bind to auth.uid(); search_path; attempt cap
-- ---------------------------------------------------------------------------
create or replace function public.verify_pending_code(
  p_user_id uuid,
  p_method text,
  p_code text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := encode(digest(p_code, 'sha256'), 'hex');
  v_row record;
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  if not v_is_service then
    if auth.uid() is null or auth.uid() is distinct from p_user_id then
      raise exception 'Forbidden';
    end if;
  end if;

  select * into v_row from public.pending_verifications
  where user_id = p_user_id and method = lower(p_method) and verified = false and expires_at > now()
  order by created_at desc limit 1;

  if not found then
    return false;
  end if;

  if coalesce(v_row.attempts, 0) >= 5 then
    return false;
  end if;

  update public.pending_verifications
  set attempts = coalesce(attempts, 0) + 1
  where id = v_row.id;

  if v_row.code_hash = v_hash then
    update public.pending_verifications set verified = true, verified_at = now() where id = v_row.id;
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.verify_pending_code(uuid, text, text) from public;
revoke all on function public.verify_pending_code(uuid, text, text) from anon;
grant execute on function public.verify_pending_code(uuid, text, text) to authenticated;
grant execute on function public.verify_pending_code(uuid, text, text) to service_role;

create or replace function public.create_pending_verification(
  p_user_id uuid,
  p_method text,
  p_destination text,
  p_ttl_seconds integer default 600
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lpad((floor(random() * 900000 + 100000))::int::text, 6, '0');
  v_hash text := encode(digest(v_code, 'sha256'), 'hex');
  v_expires timestamptz := now() + (p_ttl_seconds || ' seconds')::interval;
begin
  -- Only service_role should call this (grant enforced separately)
  insert into public.pending_verifications(user_id, method, destination, code_hash, expires_at)
  values (p_user_id, lower(p_method), p_destination, v_hash, v_expires);
  return v_code;
end;
$$;

revoke all on function public.create_pending_verification(uuid, text, text, integer) from public;
revoke all on function public.create_pending_verification(uuid, text, text, integer) from anon;
revoke all on function public.create_pending_verification(uuid, text, text, integer) from authenticated;
grant execute on function public.create_pending_verification(uuid, text, text, integer) to service_role;
