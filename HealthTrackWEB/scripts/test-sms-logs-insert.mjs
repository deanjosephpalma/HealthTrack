import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY); // using ANON key like the frontend

async function run() {
  const { data, error } = await supabase.from('sms_logs').insert([{
      phone_number: 'test@example.com',
      message: 'test message',
      status: 'failed',
  }])

  console.log('Data:', data);
  console.log('Error:', error);
}

run();
