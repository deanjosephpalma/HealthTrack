-- Phase 4 polish (apply after phase3_performance.sql)
-- Product decision: prescriptions are free-text clinical Rx on patient_records
-- (not a pharmacy / inventory dispense module). OP / TB / Animal Bite remain
-- encoded on patient_records (notes tags + shared columns), not twin tables.

alter table public.patient_records
  add column if not exists prescription text;

comment on column public.patient_records.prescription is
  'Doctor free-text prescription / medication plan; display on patient Medical Records.';
