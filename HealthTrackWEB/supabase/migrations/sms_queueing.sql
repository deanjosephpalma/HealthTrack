-- Add phone_number and sms_consent to appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS sms_consent boolean DEFAULT false;

-- Add phone_number, counter_room, and estimated_waiting_time to queue
ALTER TABLE queue
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS counter_room text,
  ADD COLUMN IF NOT EXISTS estimated_waiting_time integer;

-- Create sms_logs table
CREATE TABLE IF NOT EXISTS sms_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  queue_id uuid REFERENCES queue(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  message text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  provider_response text,
  created_at timestamptz DEFAULT now()
);

-- Enable Realtime for sms_logs (may error if publication not found - safe to ignore)
DO $$
BEGIN
  PERFORM pg_publication_tables.pubname
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime' AND tablename = 'sms_logs';

  IF NOT FOUND THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE sms_logs;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- ignore if publication does not exist
END;
$$;
