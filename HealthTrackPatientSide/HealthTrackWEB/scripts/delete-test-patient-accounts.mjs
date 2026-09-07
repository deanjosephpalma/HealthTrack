/**
 * Delete specific patient portal test accounts and all related records.
 * Run from HealthTrackWEB: node scripts/delete-test-patient-accounts.mjs
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

const TARGET_EMAILS = [
  'djpalma026@gmail.com',
  'deanjosephpalma026@gmail.com',
].map((e) => e.toLowerCase())

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function listAllAuthUsers() {
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

async function deleteWhere(table, column, values, label) {
  if (!values.length) return 0
  const { data, error } = await supabase.from(table).delete().in(column, values).select('id')
  if (error) {
    console.warn(`  ${label}: ${error.message}`)
    return 0
  }
  const count = data?.length ?? 0
  if (count > 0) console.log(`  ${label}: removed ${count}`)
  return count
}

async function deleteServiceRequestChildren(serviceRequestIds) {
  if (!serviceRequestIds.length) return
  const childTables = [
    'form_responses',
    'service_request_steps',
    'workflow_logs',
    'certificates',
    'permits',
    'tb_monitoring',
    'animal_bite_doses',
    'requirements_submissions',
  ]
  for (const table of childTables) {
    await deleteWhere(table, 'service_request_id', serviceRequestIds, table)
  }
}

async function main() {
  console.log('Target emails:')
  TARGET_EMAILS.forEach((email) => console.log(`  - ${email}`))

  const authUsers = await listAllAuthUsers()
  const targets = authUsers.filter((u) => TARGET_EMAILS.includes((u.email ?? '').toLowerCase()))

  if (targets.length === 0) {
    console.log('\nNo matching auth users found. Checking orphaned patient rows by email...')
  } else {
    console.log(`\nFound ${targets.length} auth user(s):`)
    targets.forEach((u) => console.log(`  ${u.email} (${u.id})`))
  }

  const patientAuthIds = targets.map((u) => u.id)

  const { data: patientsByAuth, error: patientsByAuthErr } = patientAuthIds.length
    ? await supabase.from('patients').select('id, patient_auth_id, email, name').in('patient_auth_id', patientAuthIds)
    : { data: [], error: null }
  if (patientsByAuthErr) throw new Error(patientsByAuthErr.message)

  const { data: patientsByEmail, error: patientsByEmailErr } = await supabase
    .from('patients')
    .select('id, patient_auth_id, email, name')
    .in('email', TARGET_EMAILS)
  if (patientsByEmailErr) throw new Error(patientsByEmailErr.message)

  const patientMap = new Map()
  for (const row of [...(patientsByAuth ?? []), ...(patientsByEmail ?? [])]) {
    patientMap.set(row.id, row)
  }
  const dbPatients = [...patientMap.values()]
  const dbPatientIds = dbPatients.map((p) => p.id)

  if (dbPatients.length) {
    console.log(`\nMatched ${dbPatients.length} patient profile(s):`)
    dbPatients.forEach((p) => console.log(`  ${p.name ?? '—'} | ${p.email ?? '—'} | id=${p.id}`))
  }

  console.log('\nDeleting related records...')

  const { data: appts } = patientAuthIds.length
    ? await supabase.from('appointments').select('id').in('patient_auth_id', patientAuthIds)
    : { data: [] }
  const apptIds = (appts ?? []).map((a) => a.id)

  if (apptIds.length) await deleteWhere('queue', 'appointment_id', apptIds, 'queue (by appointment)')
  if (dbPatientIds.length) await deleteWhere('queue', 'patient_id', dbPatientIds, 'queue (by patient)')

  const { data: reqsByPatient } = dbPatientIds.length
    ? await supabase.from('service_requests').select('id').in('patient_id', dbPatientIds)
    : { data: [] }
  const { data: reqsByAuth } = patientAuthIds.length
    ? await supabase.from('service_requests').select('id').in('patient_auth_id', patientAuthIds)
    : { data: [] }
  const reqIdSet = new Set([...(reqsByPatient ?? []), ...(reqsByAuth ?? [])].map((r) => r.id))
  const reqIds = [...reqIdSet]
  await deleteServiceRequestChildren(reqIds)
  if (dbPatientIds.length) await deleteWhere('service_requests', 'patient_id', dbPatientIds, 'service_requests')
  if (patientAuthIds.length) {
    await deleteWhere('service_requests', 'patient_auth_id', patientAuthIds, 'service_requests (by auth)')
  }

  // Follow-up / schedule rows if present
  if (dbPatientIds.length) {
    await deleteWhere('schedules', 'patient_id', dbPatientIds, 'schedules')
  }
  if (patientAuthIds.length) {
    await deleteWhere('schedules', 'patient_auth_id', patientAuthIds, 'schedules (by auth)')
  }

  if (patientAuthIds.length) await deleteWhere('profiles', 'id', patientAuthIds, 'profiles (if any)')

  if (patientAuthIds.length) await deleteWhere('appointments', 'patient_auth_id', patientAuthIds, 'appointments')
  if (dbPatientIds.length) await deleteWhere('appointments', 'patient_id', dbPatientIds, 'appointments (by patient)')

  if (patientAuthIds.length) await deleteWhere('patient_records', 'patient_auth_id', patientAuthIds, 'patient_records')
  if (dbPatientIds.length) await deleteWhere('patient_records', 'patient_id', dbPatientIds, 'patient_records (by patient)')

  if (dbPatientIds.length) {
    await deleteWhere('certificates', 'patient_id', dbPatientIds, 'certificates')
    await deleteWhere('permits', 'patient_id', dbPatientIds, 'permits')
  }

  if (patientAuthIds.length) await deleteWhere('patient_contacts', 'id', patientAuthIds, 'patient_contacts')
  for (const email of TARGET_EMAILS) {
    await supabase.from('patient_contacts').delete().ilike('email', email)
  }

  if (dbPatientIds.length) await deleteWhere('patients', 'id', dbPatientIds, 'patients')

  console.log('\nDeleting auth users...')
  for (const user of targets) {
    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) console.warn(`  auth ${user.email}: ${error.message}`)
    else console.log(`  auth deleted: ${user.email}`)
  }

  console.log('\nDone. Only the listed test accounts and their related data were targeted.')
}

main().catch((err) => {
  console.error('Cleanup failed:', err.message || err)
  process.exit(1)
})
