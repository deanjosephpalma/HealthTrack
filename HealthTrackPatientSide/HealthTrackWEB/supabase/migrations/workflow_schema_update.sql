-- ====================================================================================
-- PHASE 1: MASTER PATIENT PROFILE MIGRATION
-- ====================================================================================

-- Add Master Profile fields to patients table
ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS middle_name text,
ADD COLUMN IF NOT EXISTS last_name text,
ADD COLUMN IF NOT EXISTS philhealth_number text,
ADD COLUMN IF NOT EXISTS sex text,
ADD COLUMN IF NOT EXISTS birthdate date,
ADD COLUMN IF NOT EXISTS mother_maiden_name text,
ADD COLUMN IF NOT EXISTS civil_status text,
ADD COLUMN IF NOT EXISTS religion text,
ADD COLUMN IF NOT EXISTS blood_type text,
ADD COLUMN IF NOT EXISTS mobile_phone text,
ADD COLUMN IF NOT EXISTS education text,
ADD COLUMN IF NOT EXISTS occupation text,
ADD COLUMN IF NOT EXISTS disability text,
ADD COLUMN IF NOT EXISTS house_no_purok text,
ADD COLUMN IF NOT EXISTS barangay text,
ADD COLUMN IF NOT EXISTS municipality text DEFAULT 'Pila',
ADD COLUMN IF NOT EXISTS province text DEFAULT 'Laguna';

-- Update existing patients with data from their most recent patient_records
WITH latest_records AS (
  SELECT DISTINCT ON (patient_id) *
  FROM public.patient_records
  WHERE patient_id IS NOT NULL
  ORDER BY patient_id, created_at DESC
)
UPDATE public.patients p
SET 
  first_name = COALESCE(p.first_name, lr.first_name),
  middle_name = COALESCE(p.middle_name, lr.middle_name),
  last_name = COALESCE(p.last_name, lr.last_name),
  philhealth_number = COALESCE(p.philhealth_number, lr.philhealth_number),
  sex = COALESCE(p.sex, lr.sex),
  birthdate = COALESCE(p.birthdate, lr.birthdate),
  mother_maiden_name = COALESCE(p.mother_maiden_name, lr.mother_maiden_name),
  civil_status = COALESCE(p.civil_status, lr.civil_status),
  religion = COALESCE(p.religion, lr.religion),
  blood_type = COALESCE(p.blood_type, lr.blood_type),
  mobile_phone = COALESCE(p.mobile_phone, lr.mobile_phone),
  education = COALESCE(p.education, lr.education),
  occupation = COALESCE(p.occupation, lr.occupation),
  disability = COALESCE(p.disability, lr.disability),
  house_no_purok = COALESCE(p.house_no_purok, lr.house_no_purok),
  barangay = COALESCE(p.barangay, lr.barangay),
  municipality = COALESCE(p.municipality, lr.municipality, 'Pila'),
  province = COALESCE(p.province, lr.province, 'Laguna')
FROM latest_records lr
WHERE p.id = lr.patient_id;


-- ====================================================================================
-- PHASE 2: DYNAMIC FORM ENGINE SCHEMA
-- ====================================================================================

-- 1. Services Table
CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  queue_prefix text NOT NULL,
  estimated_duration_mins integer DEFAULT 15,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Service Requests (Replaces patient_records)
CREATE TABLE IF NOT EXISTS public.service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  queue_id uuid REFERENCES public.queue(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Draft',
  assigned_doctor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Workflow Steps
CREATE TABLE IF NOT EXISTS public.workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES public.services(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  step_name text NOT NULL,
  target_role text NOT NULL, -- e.g., 'Patient', 'Nurse', 'Doctor', 'Staff'
  description text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(service_id, step_order)
);

-- 4. Form Fields
CREATE TABLE IF NOT EXISTS public.form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_step_id uuid REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  field_name text NOT NULL, -- Machine name (e.g., 'blood_pressure')
  field_label text NOT NULL, -- Display name (e.g., 'Blood Pressure')
  field_type text NOT NULL, -- 'text', 'number', 'date', 'select', 'radio', 'checkbox', 'textarea', 'file'
  options jsonb, -- For select/radio options
  is_required boolean DEFAULT false,
  conditional_logic jsonb, -- E.g., {"dependsOn": "sex", "value": "Female"}
  field_order integer NOT NULL,
  section_name text, -- For grouping visually
  created_at timestamptz DEFAULT now()
);

-- 5. Form Responses (JSON storage per step)
CREATE TABLE IF NOT EXISTS public.form_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid REFERENCES public.service_requests(id) ON DELETE CASCADE,
  workflow_step_id uuid REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  response_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(service_request_id, workflow_step_id)
);

-- 6. Status Logs (Audit Trail)
CREATE TABLE IF NOT EXISTS public.workflow_status_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id uuid REFERENCES public.service_requests(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Add updated_at triggers
DROP TRIGGER IF EXISTS set_services_updated_at ON public.services;
CREATE TRIGGER set_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_service_requests_updated_at ON public.service_requests;
CREATE TRIGGER set_service_requests_updated_at BEFORE UPDATE ON public.service_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_form_responses_updated_at ON public.form_responses;
CREATE TRIGGER set_form_responses_updated_at BEFORE UPDATE ON public.form_responses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add RLS
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_status_logs ENABLE ROW LEVEL SECURITY;


-- Temporary lenient RLS for development (will be refined later)
CREATE POLICY "Allow all on services" ON public.services FOR ALL USING (true);
CREATE POLICY "Allow all on service_requests" ON public.service_requests FOR ALL USING (true);
CREATE POLICY "Allow all on workflow_steps" ON public.workflow_steps FOR ALL USING (true);
CREATE POLICY "Allow all on form_fields" ON public.form_fields FOR ALL USING (true);
CREATE POLICY "Allow all on form_responses" ON public.form_responses FOR ALL USING (true);
CREATE POLICY "Allow all on workflow_status_logs" ON public.workflow_status_logs FOR ALL USING (true);
