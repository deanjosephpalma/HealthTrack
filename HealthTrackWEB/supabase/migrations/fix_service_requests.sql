-- Fix existing service_requests table that was skipped by CREATE TABLE IF NOT EXISTS

-- Add the missing columns from the new architecture
ALTER TABLE public.service_requests
ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Draft',
ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update existing records to link to the 'Outpatient Consultation' service
UPDATE public.service_requests
SET 
  service_id = (SELECT id FROM public.services WHERE name = 'Outpatient Consultation' LIMIT 1),
  status = CASE 
    WHEN current_status = 'pending' THEN 'In Queue'
    WHEN current_status = 'in_progress' THEN 'For Doctor'
    WHEN current_status = 'completed' THEN 'Completed'
    ELSE 'Draft'
  END
WHERE service_id IS NULL;

-- Note: You can keep the old columns (current_status, current_step_index, etc.) for historical data,
-- or drop them later once the migration is fully stable.
