import pg from 'pg';
import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true });

const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_URL,
  });

  try {
    await client.connect();
    console.log('Connected to DB');

    const sql = `
      ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Allow anonymous inserts to sms_logs" ON sms_logs;
      CREATE POLICY "Allow anonymous inserts to sms_logs" 
      ON sms_logs FOR INSERT 
      WITH CHECK (true);

      DROP POLICY IF EXISTS "Allow patients to read their own sms_logs" ON sms_logs;
      CREATE POLICY "Allow patients to read their own sms_logs" 
      ON sms_logs FOR SELECT 
      USING (
        phone_number = (select email from auth.users where id = auth.uid())
        OR
        EXISTS (
          SELECT 1 FROM auth.users 
          WHERE auth.users.id = auth.uid() 
          AND (auth.users.raw_user_meta_data->>'role' IN ('Admin', 'Doctor', 'Nurse'))
        )
      );
    `;

    await client.query(sql);
    console.log('RLS policies applied successfully!');

  } catch (err) {
    console.error('Error applying RLS:', err);
  } finally {
    await client.end();
  }
}

run();
