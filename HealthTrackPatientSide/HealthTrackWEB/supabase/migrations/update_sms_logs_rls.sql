-- Enable Row Level Security (if not already enabled)
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

-- Allow anyone (including anonymous/staff) to INSERT into sms_logs
CREATE POLICY "Allow anonymous inserts to sms_logs" 
ON sms_logs FOR INSERT 
WITH CHECK (true);

-- Allow patients to SELECT their own sms_logs
-- Patients can see logs if the phone_number (email) matches their auth email
CREATE POLICY "Allow patients to read their own sms_logs" 
ON sms_logs FOR SELECT 
USING (
  phone_number = (select email from auth.users where id = auth.uid())
  OR
  -- Staff members (admin, doctor, nurse) can see everything
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND (auth.users.raw_user_meta_data->>'role' IN ('Admin', 'Doctor', 'Nurse'))
  )
);
