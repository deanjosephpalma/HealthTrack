-- =============================================================================
-- RHU Citizens Charter Workflow Management System
-- Migration: rhu_workflow_system.sql
--
-- Run in Supabase Dashboard → SQL Editor
-- All statements are idempotent (safe to re-run)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend existing tables
-- ---------------------------------------------------------------------------

-- appointments: add reference number (RHU-YYYY-NNNNNN)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reference_number text UNIQUE;

-- Create a unique reference number generator
CREATE OR REPLACE FUNCTION public.generate_appointment_reference()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  year_part  text := to_char(now(), 'YYYY');
  seq_val    bigint;
  ref        text;
BEGIN
  -- Use a sequence scoped to this year
  LOOP
    SELECT COUNT(*) + 1
      INTO seq_val
      FROM public.appointments
     WHERE reference_number LIKE 'RHU-' || year_part || '-%';

    ref := 'RHU-' || year_part || '-' || lpad(seq_val::text, 6, '0');

    -- Exit if no collision
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.appointments WHERE reference_number = ref
    );
  END LOOP;
  RETURN ref;
END;
$$;

-- queue: add service_code (prefix like AB, OPD, MC, HC, TB, PM, DC, EC, SP)
ALTER TABLE public.queue
  ADD COLUMN IF NOT EXISTS service_code text;

-- service_types: add queue prefix and workflow template
ALTER TABLE public.service_types
  ADD COLUMN IF NOT EXISTS queue_prefix text,
  ADD COLUMN IF NOT EXISTS workflow_steps jsonb DEFAULT '[]'::jsonb;

-- Seed queue prefixes for known services (update by name, safe to re-run)
UPDATE public.service_types
SET queue_prefix = CASE
  WHEN lower(name) LIKE '%animal%bite%'     THEN 'AB'
  WHEN lower(name) LIKE '%outpatient%'       THEN 'OPD'
  WHEN lower(name) LIKE '%medical%cert%'     THEN 'MC'
  WHEN lower(name) LIKE '%health%card%'      THEN 'HC'
  WHEN lower(name) LIKE '%tuberculosis%' OR lower(name) LIKE '%tb%' THEN 'TB'
  WHEN lower(name) LIKE '%pre-marriage%' OR lower(name) LIKE '%marriage%' THEN 'PM'
  WHEN lower(name) LIKE '%death%cert%'       THEN 'DC'
  WHEN lower(name) LIKE '%exhumation%' OR lower(name) LIKE '%cremation%' THEN 'EC'
  WHEN lower(name) LIKE '%sanitary%'         THEN 'SP'
  ELSE 'RHU'
END
WHERE queue_prefix IS NULL;

-- Seed workflow steps per service type
UPDATE public.service_types
SET workflow_steps = CASE
  WHEN queue_prefix = 'AB' THEN '[
    {"step": 1, "name": "Registration",          "type": "registration",   "staff": "nurse"},
    {"step": 2, "name": "Queue Assignment",       "type": "queue",          "staff": "nurse"},
    {"step": 3, "name": "Nurse Assessment",       "type": "assessment",     "staff": "nurse"},
    {"step": 4, "name": "Vaccination",            "type": "vaccination",    "staff": "nurse"},
    {"step": 5, "name": "Follow-up Scheduling",   "type": "followup",       "staff": "nurse"},
    {"step": 6, "name": "Completed",              "type": "completion",     "staff": "nurse"}
  ]'::jsonb
  WHEN queue_prefix = 'OPD' THEN '[
    {"step": 1, "name": "Registration",           "type": "registration",   "staff": "nurse"},
    {"step": 2, "name": "Vital Signs",            "type": "vitals",         "staff": "nurse"},
    {"step": 3, "name": "Consultation",           "type": "consultation",   "staff": "doctor"},
    {"step": 4, "name": "Diagnosis & Prescription","type": "diagnosis",     "staff": "doctor"},
    {"step": 5, "name": "Completed",              "type": "completion",     "staff": "nurse"}
  ]'::jsonb
  WHEN queue_prefix IN ('MC', 'DC') THEN '[
    {"step": 1, "name": "Request & Evaluation",   "type": "evaluation",     "staff": "nurse"},
    {"step": 2, "name": "Encoding & Printing",    "type": "processing",     "staff": "nurse"},
    {"step": 3, "name": "Doctor Approval",        "type": "approval",       "staff": "doctor"},
    {"step": 4, "name": "Release",                "type": "release",        "staff": "nurse"},
    {"step": 5, "name": "Completed",              "type": "completion",     "staff": "nurse"}
  ]'::jsonb
  WHEN queue_prefix = 'HC' THEN '[
    {"step": 1, "name": "Requirements Check",     "type": "evaluation",     "staff": "nurse"},
    {"step": 2, "name": "Examination",            "type": "examination",    "staff": "nurse"},
    {"step": 3, "name": "Payment",                "type": "payment",        "staff": "nurse"},
    {"step": 4, "name": "Card Release",           "type": "release",        "staff": "nurse"},
    {"step": 5, "name": "Completed",              "type": "completion",     "staff": "nurse"}
  ]'::jsonb
  WHEN queue_prefix = 'TB' THEN '[
    {"step": 1, "name": "Requirements Check",     "type": "evaluation",     "staff": "nurse"},
    {"step": 2, "name": "Consultation",           "type": "consultation",   "staff": "doctor"},
    {"step": 3, "name": "Medicine Release",       "type": "release",        "staff": "nurse"},
    {"step": 4, "name": "Weekly Follow-up",       "type": "followup",       "staff": "nurse"},
    {"step": 5, "name": "Completed",              "type": "completion",     "staff": "nurse"}
  ]'::jsonb
  WHEN queue_prefix = 'PM' THEN '[
    {"step": 1, "name": "Registration",           "type": "registration",   "staff": "nurse"},
    {"step": 2, "name": "Seminar Scheduling",     "type": "scheduling",     "staff": "nurse"},
    {"step": 3, "name": "Attendance",             "type": "attendance",     "staff": "nurse"},
    {"step": 4, "name": "Certificate Release",    "type": "release",        "staff": "nurse"},
    {"step": 5, "name": "Completed",              "type": "completion",     "staff": "nurse"}
  ]'::jsonb
  WHEN queue_prefix IN ('EC', 'SP') THEN '[
    {"step": 1, "name": "Document Submission",    "type": "submission",     "staff": "nurse"},
    {"step": 2, "name": "Evaluation",             "type": "evaluation",     "staff": "nurse"},
    {"step": 3, "name": "Doctor/MHO Approval",    "type": "approval",       "staff": "doctor"},
    {"step": 4, "name": "Permit Release",         "type": "release",        "staff": "nurse"},
    {"step": 5, "name": "Completed",              "type": "completion",     "staff": "nurse"}
  ]'::jsonb
  ELSE workflow_steps
END
WHERE queue_prefix IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. service_requests — main transaction record per patient-service visit
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_requests (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number    text        UNIQUE NOT NULL,
  patient_id          uuid        REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_auth_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  service_type_id     uuid        NOT NULL REFERENCES public.service_types(id),
  appointment_id      uuid        REFERENCES public.appointments(id) ON DELETE SET NULL,
  queue_id            uuid        REFERENCES public.queue(id) ON DELETE SET NULL,
  current_step_index  integer     NOT NULL DEFAULT 0,
  current_status      text        NOT NULL DEFAULT 'pending'
    CHECK (current_status IN ('pending','active','waiting','in_progress','completed','cancelled')),
  assigned_staff_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_doctor_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  remarks             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_requests_patient_idx
  ON public.service_requests (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_status_idx
  ON public.service_requests (current_status, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_ref_idx
  ON public.service_requests (reference_number);

-- ---------------------------------------------------------------------------
-- 3. service_request_steps — per-request step states
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_request_steps (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  uuid        NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  step_index          integer     NOT NULL,
  step_name           text        NOT NULL,
  step_type           text        NOT NULL,
  assigned_to         text        NOT NULL DEFAULT 'nurse'
    CHECK (assigned_to IN ('nurse','doctor','staff')),
  status              text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','skipped')),
  completed_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at        timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_request_id, step_index)
);

CREATE INDEX IF NOT EXISTS service_request_steps_request_idx
  ON public.service_request_steps (service_request_id, step_index);

-- ---------------------------------------------------------------------------
-- 4. workflow_logs — full audit trail of step transitions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.workflow_logs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  uuid        NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  step_index          integer,
  step_name           text,
  action              text        NOT NULL,
  performed_by        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_logs_request_idx
  ON public.workflow_logs (service_request_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. certificates — medical cert, health card, death cert review
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.certificates (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  uuid        REFERENCES public.service_requests(id) ON DELETE SET NULL,
  patient_id          uuid        REFERENCES public.patients(id) ON DELETE SET NULL,
  cert_type           text        NOT NULL
    CHECK (cert_type IN ('medical','health_card','death_cert_review','pre_marriage')),
  purpose             text,
  issued_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at           timestamptz,
  released_at         timestamptz,
  file_url            text,
  status              text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','approved','released','cancelled')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS certificates_patient_idx
  ON public.certificates (patient_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 6. permits — exhumation, cremation, transfer, sanitary
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.permits (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  uuid        REFERENCES public.service_requests(id) ON DELETE SET NULL,
  patient_id          uuid        REFERENCES public.patients(id) ON DELETE SET NULL,
  permit_type         text        NOT NULL
    CHECK (permit_type IN ('exhumation','cremation','transfer','sanitary')),
  applicant_name      text,
  details             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  issued_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at         timestamptz,
  released_at         timestamptz,
  status              text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','evaluating','approved','released','rejected')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS permits_patient_idx
  ON public.permits (patient_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7. tb_monitoring — weekly follow-up schedule for TB patients
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tb_monitoring (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id      uuid        REFERENCES public.service_requests(id) ON DELETE SET NULL,
  patient_id              uuid        REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_auth_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_number            text,
  start_date              date        NOT NULL DEFAULT CURRENT_DATE,
  -- Schedule stored as array of {date, status, notes}
  schedule                jsonb       NOT NULL DEFAULT '[]'::jsonb,
  last_visit_date         date,
  medicines_released_at   timestamptz,
  treatment_duration_weeks integer    NOT NULL DEFAULT 24,
  status                  text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','defaulted','transferred')),
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tb_monitoring_patient_idx
  ON public.tb_monitoring (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tb_monitoring_status_idx
  ON public.tb_monitoring (status, start_date);

-- ---------------------------------------------------------------------------
-- 8. animal_bite_doses — Anti-Rabies follow-up dose schedule
--    Standard schedule: Day 0, Day 3, Day 7, Day 14, Day 28
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.animal_bite_doses (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  uuid        REFERENCES public.service_requests(id) ON DELETE SET NULL,
  patient_id          uuid        REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_auth_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  phone_number        text,
  bite_date           date,
  dose_1_date         date,
  dose_2_date         date,   -- Day 3
  dose_3_date         date,   -- Day 7
  dose_4_date         date,   -- Day 14
  dose_5_date         date,   -- Day 28
  dose_1_done         boolean NOT NULL DEFAULT false,
  dose_2_done         boolean NOT NULL DEFAULT false,
  dose_3_done         boolean NOT NULL DEFAULT false,
  dose_4_done         boolean NOT NULL DEFAULT false,
  dose_5_done         boolean NOT NULL DEFAULT false,
  dose_1_given_at     timestamptz,
  dose_2_given_at     timestamptz,
  dose_3_given_at     timestamptz,
  dose_4_given_at     timestamptz,
  dose_5_given_at     timestamptz,
  next_due_date       date,
  next_due_dose       integer,  -- 1-5
  status              text    NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','defaulted')),
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS animal_bite_doses_patient_idx
  ON public.animal_bite_doses (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS animal_bite_doses_next_due_idx
  ON public.animal_bite_doses (next_due_date, status)
  WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 9. requirements_submissions — track patient document uploads per request
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.requirements_submissions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  uuid        NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
  patient_auth_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  document_name       text        NOT NULL,
  file_path           text,         -- Supabase Storage path: rhu-requirements/<patient_id>/<filename>
  file_url            text,
  status              text        NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','reviewed','accepted','rejected')),
  reviewed_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         timestamptz,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS requirements_submissions_request_idx
  ON public.requirements_submissions (service_request_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 10. Updated triggers for new tables
-- ---------------------------------------------------------------------------

-- set_updated_at trigger for service_requests
DROP TRIGGER IF EXISTS service_requests_set_updated_at ON public.service_requests;
CREATE TRIGGER service_requests_set_updated_at
  BEFORE UPDATE ON public.service_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- set_updated_at trigger for tb_monitoring
DROP TRIGGER IF EXISTS tb_monitoring_set_updated_at ON public.tb_monitoring;
CREATE TRIGGER tb_monitoring_set_updated_at
  BEFORE UPDATE ON public.tb_monitoring
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- set_updated_at trigger for animal_bite_doses
DROP TRIGGER IF EXISTS animal_bite_doses_set_updated_at ON public.animal_bite_doses;
CREATE TRIGGER animal_bite_doses_set_updated_at
  BEFORE UPDATE ON public.animal_bite_doses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 11. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.service_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_request_steps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permits                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_monitoring          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animal_bite_doses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirements_submissions ENABLE ROW LEVEL SECURITY;

-- Staff (Doctor/Nurse) — full access
DROP POLICY IF EXISTS service_requests_staff ON public.service_requests;
CREATE POLICY service_requests_staff ON public.service_requests
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'))
  WITH CHECK (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'));

DROP POLICY IF EXISTS service_request_steps_staff ON public.service_request_steps;
CREATE POLICY service_request_steps_staff ON public.service_request_steps
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'))
  WITH CHECK (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'));

DROP POLICY IF EXISTS workflow_logs_staff ON public.workflow_logs;
CREATE POLICY workflow_logs_staff ON public.workflow_logs
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'))
  WITH CHECK (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'));

DROP POLICY IF EXISTS certificates_staff ON public.certificates;
CREATE POLICY certificates_staff ON public.certificates
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'))
  WITH CHECK (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'));

DROP POLICY IF EXISTS permits_staff ON public.permits;
CREATE POLICY permits_staff ON public.permits
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'))
  WITH CHECK (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'));

DROP POLICY IF EXISTS tb_monitoring_staff ON public.tb_monitoring;
CREATE POLICY tb_monitoring_staff ON public.tb_monitoring
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'))
  WITH CHECK (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'));

DROP POLICY IF EXISTS animal_bite_doses_staff ON public.animal_bite_doses;
CREATE POLICY animal_bite_doses_staff ON public.animal_bite_doses
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'))
  WITH CHECK (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'));

-- Patients — can view their own records
DROP POLICY IF EXISTS service_requests_patient ON public.service_requests;
CREATE POLICY service_requests_patient ON public.service_requests
  FOR SELECT TO authenticated
  USING (patient_auth_id = auth.uid());

DROP POLICY IF EXISTS requirements_patient_insert ON public.requirements_submissions;
CREATE POLICY requirements_patient_insert ON public.requirements_submissions
  FOR INSERT TO authenticated
  WITH CHECK (patient_auth_id = auth.uid());

DROP POLICY IF EXISTS requirements_patient_select ON public.requirements_submissions;
CREATE POLICY requirements_patient_select ON public.requirements_submissions
  FOR SELECT TO authenticated
  USING (patient_auth_id = auth.uid()
    OR public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'));

DROP POLICY IF EXISTS requirements_staff ON public.requirements_submissions;
CREATE POLICY requirements_staff ON public.requirements_submissions
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'))
  WITH CHECK (public.current_user_role() IN ('Doctor', 'Nurse', 'Admin'));

-- ---------------------------------------------------------------------------
-- 12. Supabase Realtime
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_request_steps;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.animal_bite_doses;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tb_monitoring;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- Note: Create Supabase Storage bucket manually in Dashboard:
--   Bucket name: rhu-requirements
--   Access: private (authenticated only)
--   Max file size: 10MB
--   Allowed MIME types: image/*, application/pdf
-- ---------------------------------------------------------------------------
