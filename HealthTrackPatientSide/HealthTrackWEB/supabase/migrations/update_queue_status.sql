-- Drop the old constraint if it exists
ALTER TABLE queue DROP CONSTRAINT IF EXISTS queue_status_check;

-- Add the new constraint including all statuses used by QueuePage.jsx
ALTER TABLE queue ADD CONSTRAINT queue_status_check 
CHECK (status IN ('waiting', 'next', 'called', 'skipped', 'completed', 'done', 'cancelled'));
