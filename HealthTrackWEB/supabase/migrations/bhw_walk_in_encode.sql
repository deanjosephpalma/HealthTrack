-- Save a walk-in patient and encoded request atomically before ticket issuance.
create or replace function public.save_bhw_walk_in(
  p_request_id uuid, p_patient_id uuid, p_service_type_id uuid,
  p_patient_data jsonb, p_intake_data jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_patient public.patients;
  v_existing public.service_requests;
begin
  if auth.uid() is null or coalesce(public.current_user_role(), '') not in ('Admin', 'Nurse', 'Doctor', 'BHW', 'Volunteer') then
    raise exception 'Only authorized staff can encode walk-ins';
  end if;
  if p_request_id is null or p_patient_id is null then
    raise exception 'Patient and request identifiers are required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_existing from public.service_requests where id = p_request_id;
  if found then
    if v_existing.patient_id = p_patient_id
      and v_existing.service_type_id = p_service_type_id
      and v_existing.intake_data->>'encoded_by' = auth.uid()::text then
      return v_existing.id;
    end if;
    raise exception 'Request identifier already in use';
  end if;
  if not exists (select 1 from public.service_types where id = p_service_type_id and active = true) then
    raise exception 'Select an active service';
  end if;
  select * into v_patient from jsonb_populate_record(null::public.patients, p_patient_data);
  if nullif(trim(v_patient.name), '') is null or v_patient.name = 'Patient' then
    raise exception 'Patient name is required';
  end if;
  insert into public.patients (
    id, name, first_name, middle_name, last_name, birthdate, sex, civil_status,
    blood_type, religion, mother_maiden_name, mobile_phone, phone, philhealth_number,
    education, occupation, disability, house_no_purok, barangay, municipality, province, encoded_by
  ) values (
    p_patient_id, v_patient.name, v_patient.first_name, v_patient.middle_name, v_patient.last_name,
    v_patient.birthdate, v_patient.sex, v_patient.civil_status, v_patient.blood_type,
    v_patient.religion, v_patient.mother_maiden_name, v_patient.mobile_phone, v_patient.phone,
    v_patient.philhealth_number, v_patient.education, v_patient.occupation, v_patient.disability,
    v_patient.house_no_purok, v_patient.barangay, v_patient.municipality, v_patient.province, auth.uid()
  );
  insert into public.service_requests (
    id, reference_number, patient_id, service_type_id, status, current_status, intake_data
  ) values (
    p_request_id, 'WI-' || p_request_id::text, p_patient_id, p_service_type_id,
    'Encoded', 'pending', coalesce(p_intake_data, '{}'::jsonb) || jsonb_build_object(
      'source', 'walk_in', 'encoded_by', auth.uid(), 'encoded_at', now()
    )
  );
  return p_request_id;
end;
$$;
revoke all on function public.save_bhw_walk_in(uuid, uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_bhw_walk_in(uuid, uuid, uuid, jsonb, jsonb) to authenticated;
