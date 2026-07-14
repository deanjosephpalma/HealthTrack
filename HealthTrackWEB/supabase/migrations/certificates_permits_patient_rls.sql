-- Ensure certificates / permits tables exist, then patient SELECT RLS

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

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permits ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS certificates_patient_select ON public.certificates;
CREATE POLICY certificates_patient_select ON public.certificates
  FOR SELECT TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM public.patients p WHERE p.patient_auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS permits_patient_select ON public.permits;
CREATE POLICY permits_patient_select ON public.permits
  FOR SELECT TO authenticated
  USING (
    patient_id IN (
      SELECT p.id FROM public.patients p WHERE p.patient_auth_id = auth.uid()
    )
  );

-- Patients may insert a released cert/permit for their own completed service requests (backfill)
DROP POLICY IF EXISTS certificates_patient_insert ON public.certificates;
CREATE POLICY certificates_patient_insert ON public.certificates
  FOR INSERT TO authenticated
  WITH CHECK (
    patient_id IN (
      SELECT p.id FROM public.patients p WHERE p.patient_auth_id = auth.uid()
    )
    AND status = 'released'
  );

DROP POLICY IF EXISTS permits_patient_insert ON public.permits;
CREATE POLICY permits_patient_insert ON public.permits
  FOR INSERT TO authenticated
  WITH CHECK (
    patient_id IN (
      SELECT p.id FROM public.patients p WHERE p.patient_auth_id = auth.uid()
    )
    AND status = 'released'
  );
