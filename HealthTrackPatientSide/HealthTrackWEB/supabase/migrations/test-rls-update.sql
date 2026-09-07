-- Temporarily allow all reads to test if RLS is the blocker
DROP POLICY IF EXISTS "Allow patients to read their own email_logs" ON email_logs;
CREATE POLICY "Allow patients to read their own email_logs" 
ON email_logs FOR SELECT 
USING ( true );
