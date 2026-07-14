/**
 * Safely clears ONLY registered patient portal accounts and their related operational records.
 * Keeps all staff-encoded patients (historical data) completely untouched.
 *
 * Runs automatically using Supabase Service Role credentials.
 */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'node:path'

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

async function main() {
  console.log('Fetching patient portal registered users...')

  // 1. Get all auth users that were created by the patient portal
  // Patient portal signups have app = 'patient' in metadata
  const authUsers = await listAllAuthUsers()
  const registeredPatientUsers = authUsers.filter(
    (u) => u.raw_user_meta_data?.app === 'patient'
  )

  if (registeredPatientUsers.length === 0) {
    console.log('No registered patient portal accounts found to delete.')
    return
  }

  const patientAuthIds = registeredPatientUsers.map((u) => u.id)
  console.log(`Found ${registeredPatientUsers.length} registered patient(s) to remove:`)
  registeredPatientUsers.forEach((u) => console.log(`  - ${u.email} (${u.id})`))

  // 2. Fetch their corresponding database patient IDs from the 'patients' table
  const { data: dbPatients, error: patientFetchError } = await supabase
    .from('patients')
    .select('id, patient_auth_id')
    .in('patient_auth_id', patientAuthIds)

  if (patientFetchError) {
    throw new Error(`Failed to fetch patients: ${patientFetchError.message}`)
  }

  const dbPatientIds = (dbPatients ?? []).map((p) => p.id)
  console.log(`Mapped to ${dbPatientIds.length} database patient profile(s).`)

  // 3. Delete from dependent operational tables sequentially to respect foreign key constraints
  if (dbPatientIds.length > 0) {
    // A. Delete queue entries linked to their appointments
    const { data: appts } = await supabase
      .from('appointments')
      .select('id')
      .in('patient_auth_id', patientAuthIds)
    const apptIds = (appts ?? []).map((a) => a.id)

    if (apptIds.length > 0) {
      console.log(`Clearing queue entries for ${apptIds.length} appointments...`)
      await supabase.from('queue').delete().in('appointment_id', apptIds)
    }

    // B. Delete form responses linked to their service requests
    const { data: reqs } = await supabase
      .from('service_requests')
      .select('id')
      .in('patient_id', dbPatientIds)
    const reqIds = (reqs ?? []).map((r) => r.id)

    if (reqIds.length > 0) {
      console.log(`Clearing form responses and steps for ${reqIds.length} service requests...`)
      await supabase.from('form_responses').delete().in('service_request_id', reqIds)
      await supabase.from('service_request_steps').delete().in('service_request_id', reqIds)
      await supabase.from('workflow_logs').delete().in('service_request_id', reqIds)
      await supabase.from('certificates').delete().in('service_request_id', reqIds)
      await supabase.from('permits').delete().in('service_request_id', reqIds)
      await supabase.from('tb_monitoring').delete().in('service_request_id', reqIds)
      await supabase.from('animal_bite_doses').delete().in('service_request_id', reqIds)
      await supabase.from('requirements_submissions').delete().in('service_request_id', reqIds)
    }

    // C. Delete service requests
    console.log('Clearing service requests...')
    await supabase.from('service_requests').delete().in('patient_id', dbPatientIds)

    // D. Delete appointments
    console.log('Clearing appointments...')
    await supabase.from('appointments').delete().in('patient_auth_id', patientAuthIds)

    // E. Delete patient records (medical records)
    console.log('Clearing custom patient records...')
    await supabase.from('patient_records').delete().in('patient_auth_id', patientAuthIds)

    // F. Delete patient contacts
    console.log('Clearing patient contacts...')
    await supabase.from('patient_contacts').delete().in('id', patientAuthIds)

    // G. Delete from patients table (only registered ones!)
    console.log('Clearing patient profiles from patients table...')
    const { error: delPatientErr } = await supabase
      .from('patients')
      .delete()
      .in('patient_auth_id', patientAuthIds)
    if (delPatientErr) console.warn('Warning deleting patient profile:', delPatientErr.message)
  }

  // 4. Finally, delete the auth user accounts (this completely removes them from auth.users)
  console.log('Deleting auth user accounts...')
  for (const user of registeredPatientUsers) {
    const { error: delAuthErr } = await supabase.auth.admin.deleteUser(user.id)
    if (delAuthErr) {
      console.error(`  Could not delete auth user ${user.email}: ${delAuthErr.message}`)
    } else {
      console.log(`  Successfully deleted auth user: ${user.email}`)
    }
  }

  console.log('\nRegistered patient accounts and their related portal data successfully cleared! Encoded historical data was untouched.')
}

main().catch((err) => {
  console.error('Error running cleanup:', err.message || err)
  process.exit(1)
})
