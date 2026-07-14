/**
 * Clears patient portal accounts and related operational data.
 * Staff (Admin/Doctor/Nurse) profiles and auth users are preserved.
 *
 * Usage (from HealthTrackWEB):
 *   npm run clear:patient-data
 *   npm run clear:patient-data -- --dry-run
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'node:path'

const STAFF_ROLES = new Set(['Admin', 'Doctor', 'Nurse'])
const dryRun = process.argv.includes('--dry-run')

const envPath = resolve(process.cwd(), '.env.seed')
dotenv.config({ path: envPath, quiet: true })

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.seed')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function countRows(table, filter) {
  let query = supabase.from(table).select('*', { count: 'exact', head: true })
  if (filter) query = filter(query)
  const { count, error } = await query
  if (error) throw new Error(`${table}: ${error.message}`)
  return count ?? 0
}

async function deleteAllRows(table) {
  const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw new Error(`delete ${table}: ${error.message}`)
}

async function deleteAllPatients() {
  const { error } = await supabase.from('patients').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw new Error(`delete patients: ${error.message}`)
}

async function listAuthUsers() {
  const users = []
  let page = 1
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    users.push(...(data?.users ?? []))
    if ((data?.users ?? []).length < 100) break
    page += 1
  }
  return users
}

async function getStaffUserIds() {
  const { data, error } = await supabase.from('profiles').select('id, role')
  if (error) throw new Error(`profiles: ${error.message}`)
  return new Set((data ?? []).filter((row) => STAFF_ROLES.has(row.role)).map((row) => row.id))
}

async function main() {
  console.log(dryRun ? 'DRY RUN — no changes will be made\n' : 'Clearing patient data...\n')

  const staffIds = await getStaffUserIds()
  const authUsers = await listAuthUsers()
  const patientUsers = authUsers.filter((user) => !staffIds.has(user.id))

  const tablesAll = [
    'service_request_steps',
    'workflow_logs',
    'certificates',
    'permits',
    'tb_monitoring',
    'animal_bite_doses',
    'requirements_submissions',
    'service_requests',
    'patient_records',
    'medical_records',
    'queue',
    'appointments',
    'patient_service_enrollments',
    'patient_contacts',
  ]

  console.log('Counts before:')
  for (const table of tablesAll) {
    console.log(`  ${table}: ${await countRows(table)}`)
  }
  console.log(`  patients: ${await countRows('patients')}`)
  console.log(`  patient auth users to remove: ${patientUsers.length}`)
  for (const user of patientUsers) {
    console.log(`    - ${user.email ?? user.id}`)
  }

  if (dryRun) {
    console.log('\nDry run complete.')
    return
  }

  for (const table of tablesAll) {
    await deleteAllRows(table)
    console.log(`Cleared ${table}`)
  }

  await deleteAllPatients()
  console.log('Cleared all patients')

  for (const user of patientUsers) {
    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) {
      console.warn(`  Could not delete auth user ${user.email ?? user.id}: ${error.message}`)
    } else {
      console.log(`Deleted auth user: ${user.email ?? user.id}`)
    }
  }

  console.log('\nCounts after:')
  for (const table of [...tablesAll, 'patients']) {
    const count =
      table === 'patients'
        ? await countRows('patients')
        : await countRows(table)
    console.log(`  ${table}: ${count}`)
  }

  const remainingPatients = authUsers.filter((user) => !staffIds.has(user.id)).length
  const authAfter = await listAuthUsers()
  const remainingAuthPatients = authAfter.filter((user) => !staffIds.has(user.id)).length
  console.log(`  patient auth users: ${remainingAuthPatients}`)
  console.log('\nDone. Staff accounts preserved.')
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
