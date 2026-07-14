import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
        .from('queue')
        .select(
          'id, queue_number, patient_id, patient_name, reason, status, created_at, appointment_id, phone_number, counter_room, estimated_waiting_time, service_code, patient:patients!queue_patient_id_fkey(patient_number), appointment:appointments!queue_appointment_id_fkey(patient_email)'
        )
        .limit(1)

  console.log('Data:', JSON.stringify(data, null, 2));
  console.log('Error:', error);
}

run();
