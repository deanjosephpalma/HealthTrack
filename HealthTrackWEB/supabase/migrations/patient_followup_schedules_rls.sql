-- Patient visibility for Animal Bite / TB follow-up schedules

alter table public.animal_bite_doses
  add column if not exists patient_email text;

alter table public.tb_monitoring
  add column if not exists patient_email text;

-- Patients can read their own schedules
drop policy if exists animal_bite_doses_patient_select on public.animal_bite_doses;
create policy animal_bite_doses_patient_select
  on public.animal_bite_doses
  for select
  to authenticated
  using (patient_auth_id = auth.uid());

drop policy if exists tb_monitoring_patient_select on public.tb_monitoring;
create policy tb_monitoring_patient_select
  on public.tb_monitoring
  for select
  to authenticated
  using (patient_auth_id = auth.uid());
