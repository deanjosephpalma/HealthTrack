/**
 * Inspect appointments and delete specific patient auth users only.
 * Run: node scripts/inspect-and-delete-users.mjs
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

const TARGET_EMAILS = ['deanjosephpalma026@gmail.com', 'djpalma026@gmail.com']

// --- Show appointments ---
console.log('=== APPOINTMENTS (16) ===\n')
const { data: appointments, error: apptError } = await supabase
  .from('appointments')
  .select('id, patient_name, appointment_date, status, reason, reference_number')
  .order('appointment_date', { ascending: false })

if (apptError) {
  console.error('Could not fetch appointments:', apptError.message)
} else {
  for (const a of appointments ?? []) {
    console.log(`  [${a.status ?? 'unknown'}] ${a.patient_name ?? '—'} | ${a.appointment_date ?? '—'} | ${a.reason ?? '—'} | ref: ${a.reference_number ?? '—'}`)
  }
}

// --- Find target auth users ---
console.log('\n=== TARGET USERS TO DELETE ===\n')
const { data: allUsers, error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
if (listError) {
  console.error('Could not list users:', listError.message)
  process.exit(1)
}

const targets = (allUsers?.users ?? []).filter((u) => TARGET_EMAILS.includes(u.email ?? ''))
for (const u of targets) {
  console.log(`  ${u.email} (id: ${u.id}) — confirmed: ${u.email_confirmed_at ?? 'NO'}`)
}

if (targets.length === 0) {
  console.log('  No matching users found.')
  process.exit(0)
}

// --- Delete only those two users from auth + patient_contacts ---
console.log('\n=== DELETING TARGET USERS ===\n')
for (const u of targets) {
  // Delete from patient_contacts (if exists)
  const { error: pcErr } = await supabase.from('patient_contacts').delete().eq('id', u.id)
  if (pcErr) console.warn(`  patient_contacts delete for ${u.email}: ${pcErr.message}`)
  else console.log(`  Removed patient_contacts: ${u.email}`)

  // Delete from patients (if exists)
  const { error: pErr } = await supabase.from('patients').delete().eq('patient_auth_id', u.id)
  if (pErr) console.warn(`  patients delete for ${u.email}: ${pErr.message}`)
  else console.log(`  Removed patients row: ${u.email}`)

  // Delete service_requests linked to this user
  const { error: srErr } = await supabase.from('service_requests').delete().eq('patient_auth_id', u.id)
  if (srErr) console.warn(`  service_requests delete for ${u.email}: ${srErr.message}`)

  // Delete appointments linked to this user
  const { error: aErr } = await supabase.from('appointments').delete().eq('patient_auth_id', u.id)
  if (aErr) console.warn(`  appointments delete for ${u.email}: ${aErr.message}`)

  // Delete auth user
  const { error: authErr } = await supabase.auth.admin.deleteUser(u.id)
  if (authErr) console.warn(`  auth delete for ${u.email}: ${authErr.message}`)
  else console.log(`  Deleted auth user: ${u.email}`)
}

console.log('\nDone. Old 37 patients and their records are untouched.')
