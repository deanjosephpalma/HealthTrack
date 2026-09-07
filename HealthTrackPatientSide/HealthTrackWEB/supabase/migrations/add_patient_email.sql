-- Add patient_email to appointments and follow-up tables
-- Run in Supabase SQL Editor

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_email text;

ALTER TABLE public.animal_bite_doses
  ADD COLUMN IF NOT EXISTS patient_email text;

ALTER TABLE public.tb_monitoring
  ADD COLUMN IF NOT EXISTS patient_email text;
