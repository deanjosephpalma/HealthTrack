-- Allow trusted server-side updates (Supabase service role / bypass flag)
-- so registration can persist address fields (house_no_purok, barangay, municipality, province).

create or replace function public.patients_protect_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Explicit bypass for trusted SQL paths.
  if coalesce(current_setting('app.bypass_patient_protect', true), '') = '1' then
    return new;
  end if;

  -- Server-side service role (Laravel via SUPABASE_SERVICE_ROLE_KEY).
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  -- Staff (Doctor/Nurse/BHW/Volunteer/Admin) may manage privileged fields.
  if public.is_staff_role() then
    return new;
  end if;

  -- Non-staff patient may only edit demographics on their own row.
  if auth.uid() is null or auth.uid() is distinct from old.patient_auth_id then
    raise exception 'Not allowed to update this patient row';
  end if;

  new.patient_auth_id := old.patient_auth_id;
  new.patient_number := old.patient_number;
  new.encoded_by := old.encoded_by;
  new.queue_id := old.queue_id;
  new.archived_at := old.archived_at;
  new.archived_by := old.archived_by;
  new.created_at := old.created_at;

  return new;
end;
$$;

