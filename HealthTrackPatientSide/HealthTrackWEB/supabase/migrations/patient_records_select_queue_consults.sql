-- Allow patients to read their own paperless consult records
-- (including queue-based Doctor Consult which has no appointment_id)

drop policy if exists patient_records_select_patient on public.patient_records;
create policy patient_records_select_patient
on public.patient_records
for select
to authenticated
using (
  patient_auth_id = auth.uid()
  or patient_id in (
    select p.id from public.patients p where p.patient_auth_id = auth.uid()
  )
);

-- Backfill auth link for records created from queue consults
update public.patient_records pr
set patient_auth_id = p.patient_auth_id
from public.patients p
where pr.patient_id = p.id
  and pr.patient_auth_id is null
  and p.patient_auth_id is not null;
