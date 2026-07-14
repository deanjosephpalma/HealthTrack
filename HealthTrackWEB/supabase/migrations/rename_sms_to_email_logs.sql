-- Rename the table
ALTER TABLE IF EXISTS sms_logs RENAME TO email_logs;

-- Rename the phone_number column to recipient_email
ALTER TABLE email_logs RENAME COLUMN IF EXISTS phone_number TO recipient_email;

-- Ensure RLS is enabled on the new table name
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they carried over
DROP POLICY IF EXISTS "Allow anonymous inserts to sms_logs" ON email_logs;
DROP POLICY IF EXISTS "Allow patients to read their own sms_logs" ON email_logs;
DROP POLICY IF EXISTS "Allow anonymous inserts to email_logs" ON email_logs;
DROP POLICY IF EXISTS "Allow patients to read their own email_logs" ON email_logs;

-- Create new policies
CREATE POLICY "Allow anonymous inserts to email_logs" 
ON email_logs FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow patients to read their own email_logs" 
ON email_logs FOR SELECT 
USING (
  lower(recipient_email) = lower((select email from auth.users where id = auth.uid()))
  OR
  EXISTS (
    SELECT 1 FROM auth.users 
    WHERE auth.users.id = auth.uid() 
    AND (auth.users.raw_user_meta_data->>'role' IN ('Admin', 'Doctor', 'Nurse'))
  )
);

-- Enable Realtime for email_logs (may error if publication not found - safe to ignore)
DO $$
BEGIN
  PERFORM pg_publication_tables.pubname
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND tablename = 'email_logs';

  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE email_logs;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- ignore if publication does not exist
END;
$$;
