-- Drop the old constraint if it exists
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;

-- Add the new constraint including 'accepted'
ALTER TABLE appointments ADD CONSTRAINT appointments_status_check 
CHECK (status IN ('scheduled', 'accepted', 'checked_in', 'in_queue', 'completed', 'cancelled', 'no_show'));
