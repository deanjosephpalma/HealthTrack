import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.rpc('run_sql', { sql: 'SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = \'appointments_status_check\'' });
  console.log(data, error);
}

run();
