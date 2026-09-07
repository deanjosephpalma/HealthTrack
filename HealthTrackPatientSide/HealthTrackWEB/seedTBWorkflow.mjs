import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function seed() {
  console.log('Starting seed for TB...')
  
  // 1. Insert Service
  let { data: tb, error: tbErr } = await supabase.from('services').insert([
    {
      name: 'Tuberculosis Treatment Services',
      description: 'TB DOTS and treatment',
      queue_prefix: 'TBS',
      estimated_duration_mins: 20
    }
  ]).select('id').single()
  
  if (tbErr) {
     if (tbErr.code === '23505') {
       const { data: existing } = await supabase.from('services').select('id').eq('name', 'Tuberculosis Treatment Services').single()
       if (existing) tb = existing
     } else {
       console.error('Error inserting service', tbErr)
       return
     }
  }
  
  console.log('TB Service ID:', tb?.id)
  if (!tb) return

  // 2. Insert Workflow Steps
  // Step 1: Patient Intake
  const { data: step1 } = await supabase.from('workflow_steps').insert({
    service_id: tb.id,
    step_order: 1,
    step_name: 'Patient Intake',
    target_role: 'Patient',
    description: 'Initial intake filled by patient'
  }).select('id').single()
  
  // Step 2: Nurse Assessment
  const { data: step2 } = await supabase.from('workflow_steps').insert({
    service_id: tb.id,
    step_order: 2,
    step_name: 'Vital Signs & Assessment',
    target_role: 'Nurse',
    description: 'Vital signs and TB screening by Nurse'
  }).select('id').single()

  // Step 3: Doctor Diagnosis
  const { data: step3 } = await supabase.from('workflow_steps').insert({
    service_id: tb.id,
    step_order: 3,
    step_name: 'Diagnosis & Treatment Plan',
    target_role: 'Doctor',
    description: 'Diagnosis and TB DOTS plan'
  }).select('id').single()
  
  console.log('Steps inserted', { step1: step1?.id, step2: step2?.id, step3: step3?.id })

  // 3. Insert Form Fields
  if (step2) {
    await supabase.from('form_fields').insert([
      { workflow_step_id: step2.id, field_name: 'wt', field_label: 'Weight (kg)', field_type: 'number', is_required: true, field_order: 1 },
      { workflow_step_id: step2.id, field_name: 'ht', field_label: 'Height (cm)', field_type: 'number', is_required: true, field_order: 2 },
      { workflow_step_id: step2.id, field_name: 'temp', field_label: 'Temperature (°C)', field_type: 'number', is_required: true, field_order: 3 },
      { workflow_step_id: step2.id, field_name: 'bp', field_label: 'Blood Pressure', field_type: 'text', is_required: true, field_order: 4 },
      { workflow_step_id: step2.id, field_name: 'cough_duration', field_label: 'Duration of Cough (Weeks)', field_type: 'number', is_required: true, field_order: 5 },
      { workflow_step_id: step2.id, field_name: 'nurse_notes', field_label: 'Screening Notes', field_type: 'textarea', is_required: false, field_order: 6 }
    ])
  }

  if (step3) {
    await supabase.from('form_fields').insert([
      { workflow_step_id: step3.id, field_name: 'diagnosis', field_label: 'Diagnosis', field_type: 'textarea', is_required: true, field_order: 1 },
      { workflow_step_id: step3.id, field_name: 'dots_category', field_label: 'DOTS Category', field_type: 'select', options: ['Category I', 'Category II', 'Category III', 'Category IV'], is_required: true, field_order: 2 },
      { workflow_step_id: step3.id, field_name: 'prescription', field_label: 'Prescription', field_type: 'textarea', is_required: true, field_order: 3 }
    ])
  }

  // UPDATE the specific service_request for the user's test
  await supabase
    .from('service_requests')
    .update({ service_id: tb.id })
    .eq('id', '7e6d2228-f147-4154-ba07-bd57366e6edb')

  console.log('Updated service_request 7e6d2228-f147-4154-ba07-bd57366e6edb to TB Service ID!')
  console.log('Seed complete!')
}

seed().catch(console.error)
