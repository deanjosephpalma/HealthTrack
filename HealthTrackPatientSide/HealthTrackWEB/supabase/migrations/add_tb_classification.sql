-- Add TB Classification field to patient_records
ALTER TABLE public.patient_records 
ADD COLUMN IF NOT EXISTS tb_classification TEXT 
CHECK (tb_classification IS NULL OR tb_classification IN ('Bacteriologically-confirmed TB', 'Clinically-diagnosed TB'));

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS patient_records_tb_classification_idx ON public.patient_records (tb_classification);
