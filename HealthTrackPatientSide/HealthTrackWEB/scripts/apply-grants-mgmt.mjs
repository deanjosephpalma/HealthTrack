/**
 * Applies GRANT EXECUTE via Supabase Management API.
 * Run: node scripts/apply-grants-mgmt.mjs
 */
import dotenv from 'dotenv'
import { resolve } from 'node:path'

dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true })

const PROJECT_REF = 'psortuygsllwyeksccfe'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.seed')
  process.exit(1)
}

const sql = [
  'grant execute on function public.create_pending_verification(uuid, text, text, integer) to anon',
  'grant execute on function public.create_pending_verification(uuid, text, text, integer) to authenticated',
  'grant execute on function public.verify_pending_code(uuid, text, text) to anon',
  'grant execute on function public.verify_pending_code(uuid, text, text) to authenticated',
].join(';\n') + ';'

// Try Supabase Management API
const mgmtRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  },
  body: JSON.stringify({ query: sql }),
})

const mgmtBody = await mgmtRes.text()
if (mgmtRes.ok) {
  console.log('Grants applied successfully via Management API.')
  console.log(mgmtBody)
} else {
  console.warn('Management API failed:', mgmtBody)
  console.log('\nPlease run this SQL manually in your Supabase SQL Editor:')
  console.log('https://supabase.com/dashboard/project/' + PROJECT_REF + '/sql/new')
  console.log('\n--- COPY THIS SQL ---')
  console.log(sql)
  console.log('--- END SQL ---')
}
