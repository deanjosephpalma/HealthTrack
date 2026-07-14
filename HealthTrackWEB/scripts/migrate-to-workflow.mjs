import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { resolve } from 'node:path'

dotenv.config({ path: resolve(process.cwd(), '.env.seed'), quiet: true })

const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const servicesData = [
  {
    name: 'Outpatient Consultation',
    description: 'General medical consultation and treatment.',
    queue_prefix: 'OPD',
    estimated_duration_mins: 15,
  },
  {
    name: 'Animal Bite',
    description: 'Evaluation and vaccination for animal bites.',
    queue_prefix: 'AB',
    estimated_duration_mins: 20,
  },
  {
    name: 'Medical Certificate',
    description: 'Issuance of medical certificates for various purposes.',
    queue_prefix: 'MC',
    estimated_duration_mins: 10,
  },
  {
    name: 'Exhumation / Cremation / Transfer Permit',
    description: 'Issuance of permits for deceased persons.',
    queue_prefix: 'PERMIT',
    estimated_duration_mins: 30,
  },
  {
    name: 'Review of Death Certificate',
    description: 'Validation and review of death certificates.',
    queue_prefix: 'DC',
    estimated_duration_mins: 20,
  },
  {
    name: 'Health Card',
    description: 'Issuance of health cards for workers.',
    queue_prefix: 'HC',
    estimated_duration_mins: 20,
  },
  {
    name: 'Sanitary Permit',
    description: 'Inspection and issuance of sanitary permits for businesses.',
    queue_prefix: 'SP',
    estimated_duration_mins: 45,
  },
  {
    name: 'Tuberculosis Treatment Services',
    description: 'TB consultation, medicine release, and monitoring.',
    queue_prefix: 'TB',
    estimated_duration_mins: 30,
  },
  {
    name: 'Pre-Marriage Counseling',
    description: 'Required counseling for soon-to-be married couples.',
    queue_prefix: 'PM',
    estimated_duration_mins: 60,
  },
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

    // Seed Steps for OPD
    if (srv.name === 'Outpatient Consultation') {
      const steps = [
        { step_order: 1, step_name: 'Patient Intake', target_role: 'Patient' },
        { step_order: 2, step_name: 'Vital Signs', target_role: 'Nurse' },
        { step_order: 3, step_name: 'Consultation', target_role: 'Doctor' },
      ]
      for (const step of steps) {
        const { data: stepData } = await supabase.from('workflow_steps').upsert({
          service_id: service.id,
          ...step
        }, { onConflict: 'service_id, step_order' }).select().single()

        if (stepData && step.step_name === 'Patient Intake') {
          await supabase.from('form_fields').upsert([
            { workflow_step_id: stepData.id, field_name: 'chief_complaint', field_label: 'Chief Complaint', field_type: 'textarea', is_required: true, field_order: 1 },
            { workflow_step_id: stepData.id, field_name: 'symptoms', field_label: 'Symptoms', field_type: 'textarea', is_required: true, field_order: 2 },
            { workflow_step_id: stepData.id, field_name: 'duration', field_label: 'Duration of Symptoms', field_type: 'text', is_required: true, field_order: 3 },
          ], { onConflict: 'id' }) // Ideally we'd have a better conflict key, but this is a seed script
        }
      }
    }
    // Add logic for Animal Bite, Medical Cert, etc. later as needed.
  }
}

async function migratePatientRecords() {
  console.log('--- Migrating Patient Records to Service Requests ---')
  
  // Get the OPD service ID as the default for old records
  const { data: opdService } = await supabase.from('services').select('id').eq('name', 'Outpatient Consultation').single()
  if (!opdService) {
    console.error('OPD service not found. Cannot migrate old records.')
    return
  }

  const { data: records, error: fetchErr } = await supabase.from('patient_records').select('*')
  if (fetchErr) {
    console.error('Failed to fetch patient_records:', fetchErr)
    return
  }

  console.log(`Found ${records?.length || 0} legacy records to migrate.`)

  for (const record of records || []) {
    // Determine status
    let newStatus = record.workflow_status || 'Completed'
    
    // Create Service Request
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

    // Now insert a dummy Form Response just to keep the old data intact inside the JSON
    // (Assuming step 1 is Intake)
    // For simplicity, we just dump the entire record into a generic 'legacy_data' JSON block for now
    // In a real strict migration we'd map it perfectly to form_fields, but this ensures no data loss.
    const { error: frErr } = await supabase.from('form_responses').insert({
      service_request_id: sr.id,
      workflow_step_id: null, // Legacy data doesn't map to a strict new step yet unless we create one
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
