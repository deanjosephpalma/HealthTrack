import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase
          .from('queue')
          .select('*, appointment:appointments!inner(patient_auth_id)')
          .in('status', ['waiting', 'next', 'called'])
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(1)

  console.log('Data:', data);
  console.log('Error:', error);
}

run();
