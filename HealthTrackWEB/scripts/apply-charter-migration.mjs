/**
 * Applies Citizen's Charter DB migration (Dynamic Form Engine & Services).
 *
 * Option A — add your Supabase direct connection string to .env.seed:
 *   DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
 *   npm run apply:charter-migration
 *
 * Option B — copy supabase/migrations/workflow_schema_update.sql into Supabase SQL Editor and run.
 *   Then, run this script without DATABASE_URL to seed the services via the REST API.
 */
import dotenv from 'dotenv'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true })

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
const sqlPath = resolve(process.cwd(), 'supabase/migrations/workflow_schema_update.sql')
const sql = readFileSync(sqlPath, 'utf8')

// We will attempt SQL migration if DATABASE_URL is present
if (databaseUrl) {
  let pg
  try {
    pg = await import('pg')
  } catch {
    console.error('Install pg first: npm install --save-dev pg')
    process.exit(1)
  }

  const client = new pg.default.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } })

  try {
    console.log('Connecting to database via direct connection string...')
    await client.connect()
    console.log('Running SQL Migration...')
    await client.query(sql)
    console.log('SQL Migration applied successfully.')
  } catch (error) {
    console.error('Migration failed:', error.message)
    process.exit(1)
  } finally {
    await client.end().catch(() => {})
  }
} else {
  console.log('--- WARNING: DATABASE_URL not found in .env.seed ---')
  console.log('Please ensure you have ALREADY RUN the following SQL file in your Supabase SQL Editor:')
  console.log(sqlPath)
  console.log('If you have already run it, proceeding to seed services...')
  console.log('----------------------------------------------------')
}

// REST API Seeding (Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const servicesData = [
  { name: 'Outpatient Consultation', description: 'General medical consultation and treatment.', queue_prefix: 'OPD', estimated_duration_mins: 15 },
  { name: 'Animal Bite', description: 'Evaluation and vaccination for animal bites.', queue_prefix: 'AB', estimated_duration_mins: 20 },
  { name: 'Medical Certificate', description: 'Issuance of medical certificates for various purposes.', queue_prefix: 'MC', estimated_duration_mins: 10 },
  { name: 'Exhumation / Cremation / Transfer Permit', description: 'Issuance of permits for deceased persons.', queue_prefix: 'PERMIT', estimated_duration_mins: 30 },
  { name: 'Review of Death Certificate', description: 'Validation and review of death certificates.', queue_prefix: 'DC', estimated_duration_mins: 20 },
  { name: 'Health Card', description: 'Issuance of health cards for workers.', queue_prefix: 'HC', estimated_duration_mins: 20 },
  { name: 'Sanitary Permit', description: 'Inspection and issuance of sanitary permits for businesses.', queue_prefix: 'SP', estimated_duration_mins: 45 },
  { name: 'Tuberculosis Treatment Services', description: 'TB consultation, medicine release, and monitoring.', queue_prefix: 'TB', estimated_duration_mins: 30 },
  { name: 'Pre-Marriage Counseling', description: 'Required counseling for soon-to-be married couples.', queue_prefix: 'PM', estimated_duration_mins: 60 },
]

async function seedServicesAndWorkflows() {
  console.log('--- Seeding Services, Steps, and Fields ---')
  for (const srv of servicesData) {
    const { data: service, error } = await supabase.from('services').upsert(
      { ...srv },
      { onConflict: 'name' }
    ).select().single()
    
    if (error) {
      console.error(`Error seeding service ${srv.name}:`, error.message)
      continue
    }
    console.log(`Seeded Service: ${srv.name}`)

    if (srv.name === 'Outpatient Consultation') {
      const steps = [
        { step_order: 1, step_name: 'Patient Intake', target_role: 'Patient' },
        { step_order: 2, step_name: 'Vital Signs', target_role: 'Nurse' },
        { step_order: 3, step_name: 'Consultation', target_role: 'Doctor' },
      ]
      for (const step of steps) {
        const { data: stepData, error: stepError } = await supabase.from('workflow_steps').upsert({
          service_id: service.id,
          ...step
        }, { onConflict: 'service_id, step_order' }).select().single()

        if (stepError) {
          console.error(`Error seeding step ${step.step_name}:`, stepError.message)
          continue
        }

        if (stepData && step.step_name === 'Patient Intake') {
          const { error: fieldsError } = await supabase.from('form_fields').upsert([
            { workflow_step_id: stepData.id, field_name: 'chief_complaint', field_label: 'Chief Complaint', field_type: 'textarea', is_required: true, field_order: 1 },
            { workflow_step_id: stepData.id, field_name: 'symptoms', field_label: 'Symptoms', field_type: 'textarea', is_required: true, field_order: 2 },
            { workflow_step_id: stepData.id, field_name: 'duration', field_label: 'Duration of Symptoms', field_type: 'text', is_required: true, field_order: 3 },
          ], { onConflict: 'id' }) 
          if(fieldsError) console.error('Error seeding intake fields:', fieldsError.message)
        }
      }
    }
  }
}

async function migratePatientRecords() {
  console.log('--- Migrating Patient Records to Service Requests ---')
  
  const { data: opdService } = await supabase.from('services').select('id').eq('name', 'Outpatient Consultation').single()
  if (!opdService) {
    console.error('OPD service not found. Cannot migrate old records.')
    return
  }

  const { data: records, error: fetchErr } = await supabase.from('patient_records').select('*')
  if (fetchErr) {
    if (fetchErr.message.includes('relation "public.patient_records" does not exist')) {
        console.log('patient_records table no longer exists or renamed, skipping data migration.')
        return
    }
    console.error('Failed to fetch patient_records:', fetchErr)
    return
  }

  console.log(`Found ${records?.length || 0} legacy records to migrate.`)

  for (const record of records || []) {
    let newStatus = record.workflow_status || 'Completed'
    
    const { data: sr, error: srErr } = await supabase.from('service_requests').insert({
      patient_id: record.patient_id,
      service_id: opdService.id,
      appointment_id: record.appointment_id,
      queue_id: record.queue_id,
      status: newStatus,
      assigned_doctor_id: record.assigned_doctor_id,
      created_by: record.created_by,
      created_at: record.created_at,
      updated_at: record.updated_at
    }).select().single()

    if (srErr) {
      console.error(`Failed to migrate record ${record.id}:`, srErr.message)
      continue
    }

    const { error: frErr } = await supabase.from('form_responses').insert({
      service_request_id: sr.id,
      workflow_step_id: null, 
      response_data: record,
      created_at: record.created_at
    })

    if (frErr) {
      console.error(`Failed to save legacy form response for ${record.id}:`, frErr.message)
    }
  }

  console.log('--- Migration Completed ---')
}

async function run() {
  await seedServicesAndWorkflows()
  await migratePatientRecords()
  console.log('All done.')
}

run()
