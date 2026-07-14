/**
 * Applies GRANT EXECUTE on verification RPCs so anon users can call them.
 * Run once: node scripts/apply-verification-grants.mjs
 */
import dotenv from 'dotenv'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true })
dotenv.config({ path: resolve(process.cwd(), '.env'), quiet: true })

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.seed')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const statements = [
  `grant execute on function public.create_pending_verification(uuid, text, text, integer) to anon`,
  `grant execute on function public.create_pending_verification(uuid, text, text, integer) to authenticated`,
  `grant execute on function public.verify_pending_code(uuid, text, text) to anon`,
  `grant execute on function public.verify_pending_code(uuid, text, text) to authenticated`,
]

for (const sql of statements) {
  let succeeded = false

  // Try via Supabase REST API directly
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql }),
  })

  if (res.ok) {
    console.log(`OK: ${sql}`)
    succeeded = true
  } else {
    const body = await res.text()
    console.warn(`exec_sql REST failed: ${body}`)
  }

  if (!succeeded) {
    console.error(`Could not apply: ${sql}`)
  }
}

console.log('\nDone. If the above failed, run this SQL in your Supabase SQL Editor:')
console.log('---')
statements.forEach((s) => console.log(s + ';'))
console.log('---')
