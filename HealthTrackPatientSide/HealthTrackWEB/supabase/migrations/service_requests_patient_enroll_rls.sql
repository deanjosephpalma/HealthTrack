-- Allow patients to enroll / switch services (service_requests INSERT + UPDATE own rows).
-- Root cause: after security_hardening_rls, patients only had SELECT on service_requests.

do $$
begin
  if to_regclass('public.service_requests') is null then
    raise notice 'service_requests table missing — skip';
    return;
  end if;

  -- Keep staff full access
  execute 'drop policy if exists service_requests_staff_all on public.service_requests';
  execute 'drop policy if exists service_requests_staff on public.service_requests';
  begin
    execute $p$
      create policy service_requests_staff
      on public.service_requests
      for all
      to authenticated
      using (public.is_staff_role())
      with check (public.is_staff_role())
    $p$;
  exception when duplicate_object then null;
  end;

  -- Patient SELECT own
  execute 'drop policy if exists service_requests_select_own on public.service_requests';
  execute 'drop policy if exists service_requests_patient on public.service_requests';
  begin
    execute $p$
      create policy service_requests_select_own
      on public.service_requests
      for select
      to authenticated
      using (
        patient_auth_id = auth.uid()
        or (
          patient_id is not null
          and public.is_patient_owner(patient_id)
        )
      )
    $p$;
  exception when duplicate_object then null;
  end;

  -- Patient INSERT own enrollment
  execute 'drop policy if exists service_requests_insert_own on public.service_requests';
  begin
    execute $p$
      create policy service_requests_insert_own
      on public.service_requests
      for insert
      to authenticated
      with check (
        patient_auth_id = auth.uid()
        and (
          patient_id is null
          or public.is_patient_owner(patient_id)
        )
      )
    $p$;
  exception when duplicate_object then null;
  end;

  -- Patient UPDATE own (switch/cancel Draft/Ready, promote status, link queue)
  execute 'drop policy if exists service_requests_update_own on public.service_requests';
  begin
    execute $p$
      create policy service_requests_update_own
      on public.service_requests
      for update
      to authenticated
      using (
        patient_auth_id = auth.uid()
        or (
          patient_id is not null
          and public.is_patient_owner(patient_id)
        )
      )
      with check (
        patient_auth_id = auth.uid()
        or (
          patient_id is not null
          and public.is_patient_owner(patient_id)
        )
      )
    $p$;
  exception when duplicate_object then null;
  end;
end $$;
