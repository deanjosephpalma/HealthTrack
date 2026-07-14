/**
 * Applies missing RLS policies so patients can insert their own service_requests.
 * Run: node scripts/apply-patient-rls.mjs
 *
 * If this script fails, copy the SQL below and run it in:
 * https://supabase.com/dashboard/project/psortuygsllwyeksccfe/sql/new
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'node:path'

dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true })

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.seed')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SQL = `
-- Allow patients to insert their own service requests
DROP POLICY IF EXISTS service_requests_patient_insert ON public.service_requests;
CREATE POLICY service_requests_patient_insert ON public.service_requests
  FOR INSERT TO authenticated
  WITH CHECK (patient_auth_id = auth.uid());

-- Allow patients to update their own service requests (e.g. cancel)
DROP POLICY IF EXISTS service_requests_patient_update ON public.service_requests;
CREATE POLICY service_requests_patient_update ON public.service_requests
  FOR UPDATE TO authenticated
  USING (patient_auth_id = auth.uid())
  WITH CHECK (patient_auth_id = auth.uid());

-- Allow patients to update their own row in patients table (for profile sync)
DROP POLICY IF EXISTS patients_update_own ON public.patients;
CREATE POLICY patients_update_own ON public.patients
  FOR UPDATE TO authenticated
  USING (patient_auth_id = auth.uid())
  WITH CHECK (patient_auth_id = auth.uid());
`

// Try via Supabase DB REST (requires pg connection, not available here)
// Instead, use the admin client to run a stored procedure if available,
// otherwise print the SQL for manual execution.
console.log('Attempting to apply RLS policies...\n')

// Try calling a raw query via the REST API query endpoint
const res = await fetch(`${supabaseUrl}/rest/v1/`, {
  method: 'GET',
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  },
})

// We can't run DDL via REST API directly — print instructions
console.log('⚠️  Cannot apply DDL via REST API automatically.')
console.log('\nPlease run this SQL in your Supabase SQL Editor:')
console.log(`👉 https://supabase.com/dashboard/project/psortuygsllwyeksccfe/sql/new`)
console.log('\n--- COPY THIS SQL ---')
console.log(SQL)
console.log('--- END SQL ---')
