/** Removes the specified test accounts, their records, and all active tickets. */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'node:path'

dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true })
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing Supabase service-role credentials in .env.seed')

const emails = ['0411@patient.healthtrack.local', '0429@patient.healthtrack.local', '0436@patient.healthtrack.local', '0392@patient.healthtrack.local', '0343@patient.healthtrack.local', '0483@patient.healthtrack.local', '0404@patient.healthtrack.local', '0397@patient.healthtrack.local', '0475@patient.healthtrack.local']
const activeStatuses = new Set(['waiting', 'next', 'called', 'skipped', 'in queue', 'in_queue', 'awaiting encoding'])
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

async function authUsers() {
  const all = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    all.push(...(data?.users ?? []))
    if ((data?.users ?? []).length < 100) return all
  }
}
async function remove(table, column, ids) {
  if (!ids.length) return 0
  const { data, error } = await supabase.from(table).delete().in(column, ids).select('id')
  if (error) { console.warn(`  ${table}: ${error.message}`); return 0 }
  return data?.length ?? 0
}
async function main() {
  const accounts = (await authUsers()).filter((u) => emails.includes((u.email ?? '').toLowerCase()))
  const authIds = accounts.map((u) => u.id)
  const { data: byEmail, error } = await supabase.from('patients').select('id,patient_auth_id').in('email', emails)
  if (error) throw new Error(`patients: ${error.message}`)
  const { data: byAuth } = authIds.length ? await supabase.from('patients').select('id,patient_auth_id').in('patient_auth_id', authIds) : { data: [] }
  const patients = [...new Map([...(byEmail ?? []), ...(byAuth ?? [])].map((p) => [p.id, p])).values()]
  const patientIds = patients.map((p) => p.id)
  const linkedAuthIds = [...new Set([...authIds, ...patients.map((p) => p.patient_auth_id).filter(Boolean)])]
  const { data: appointments } = patientIds.length || linkedAuthIds.length ? await supabase.from('appointments').select('id').or([patientIds.length ? `patient_id.in.(${patientIds.join(',')})` : '', linkedAuthIds.length ? `patient_auth_id.in.(${linkedAuthIds.join(',')})` : ''].filter(Boolean).join(',')) : { data: [] }
  const appointmentIds = (appointments ?? []).map((a) => a.id)
  const { data: rp } = patientIds.length ? await supabase.from('service_requests').select('id').in('patient_id', patientIds) : { data: [] }
  const { data: ra } = linkedAuthIds.length ? await supabase.from('service_requests').select('id').in('patient_auth_id', linkedAuthIds) : { data: [] }
  const requestIds = [...new Set([...(rp ?? []), ...(ra ?? [])].map((r) => r.id))]
  for (const table of ['form_responses', 'service_request_steps', 'workflow_logs', 'workflow_status_logs', 'certificates', 'permits', 'tb_monitoring', 'animal_bite_doses', 'requirements_submissions']) await remove(table, 'service_request_id', requestIds)
  await remove('queue', 'appointment_id', appointmentIds)
  await remove('queue', 'patient_id', patientIds)
  await remove('service_requests', 'id', requestIds)
  await remove('schedules', 'patient_id', patientIds)
  await remove('schedules', 'patient_auth_id', linkedAuthIds)
  await remove('appointments', 'id', appointmentIds)
  await remove('patient_records', 'patient_id', patientIds)
  await remove('patient_records', 'patient_auth_id', linkedAuthIds)
  await remove('medical_records', 'patient_id', patientIds)
  await remove('medical_records', 'patient_auth_id', linkedAuthIds)
  await remove('patient_contacts', 'id', linkedAuthIds)
  await remove('account_password_vault', 'user_id', linkedAuthIds)
  await remove('profiles', 'id', linkedAuthIds)
  await remove('patients', 'id', patientIds)
  for (const account of accounts) { const { error: deleteError } = await supabase.auth.admin.deleteUser(account.id); if (deleteError) console.warn(`  auth ${account.email}: ${deleteError.message}`) }
  const { data: queue, error: queueError } = await supabase.from('queue').select('id,status')
  if (queueError) throw new Error(`queue: ${queueError.message}`)
  const activeIds = (queue ?? []).filter((q) => activeStatuses.has(String(q.status ?? '').trim().toLowerCase())).map((q) => q.id)
  const activeRemoved = await remove('queue', 'id', activeIds)
  console.log(`Matched ${patients.length} patient profile(s), ${accounts.length} account(s), and removed ${activeRemoved} active queue ticket(s).`)
}
main().catch((error) => { console.error(`Cleanup failed: ${error.message || error}`); process.exit(1) })
