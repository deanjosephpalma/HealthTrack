-- Allow patients to remove their own uploaded requirement records and files.
DROP POLICY IF EXISTS requirements_patient_delete ON public.requirements_submissions;
CREATE POLICY requirements_patient_delete ON public.requirements_submissions
  FOR DELETE TO authenticated
  USING (patient_auth_id = auth.uid());

DROP POLICY IF EXISTS requirements_storage_patient_delete ON storage.objects;
CREATE POLICY requirements_storage_patient_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'rhu-requirements' AND owner_id = auth.uid()::text);
