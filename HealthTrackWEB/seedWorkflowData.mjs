import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

async function seed() {
  console.log('Starting seed...')
  
  // 1. Insert Service
  const { data: opd, error: opdErr } = await supabase.from('services').insert([
    {
      name: 'Outpatient Consultation',
      description: 'Standard medical consultation',
      queue_prefix: 'OPD',
      estimated_duration_mins: 15
    }
  ]).select('id').single()
  
  if (opdErr) {
     // If it already exists, just get it
     if (opdErr.code === '23505') {
       const { data: existing } = await supabase.from('services').select('id').eq('name', 'Outpatient Consultation').single()
       if (existing) {
         opd = existing
       }
     } else {
       console.error('Error inserting service', opdErr)
       return
     }
  }
  
  console.log('OPD Service ID:', opd?.id)
  if (!opd) return

  // 2. Insert Workflow Steps
  // Step 1: Patient Intake (if they use the app)
  const { data: step1, error: step1Err } = await supabase.from('workflow_steps').insert({
    service_id: opd.id,
    step_order: 1,
    step_name: 'Patient Intake',
    target_role: 'Patient',
    description: 'Initial intake filled by patient'
  }).select('id').single()
  
  // Step 2: Nurse Assessment
  const { data: step2, error: step2Err } = await supabase.from('workflow_steps').insert({
    service_id: opd.id,
    step_order: 2,
    step_name: 'Vital Signs & Assessment',
    target_role: 'Nurse',
    description: 'Vital signs checked by Nurse'
  }).select('id').single()

  // Step 3: Doctor Diagnosis
  const { data: step3, error: step3Err } = await supabase.from('workflow_steps').insert({
    service_id: opd.id,
    step_order: 3,
    step_name: 'Diagnosis & Prescription',
    target_role: 'Doctor',
    description: 'Medical diagnosis by Doctor'
  }).select('id').single()
  
  console.log('Steps inserted', { step1: step1?.id, step2: step2?.id, step3: step3?.id })

  // 3. Insert Form Fields
  if (step1) {
    await supabase.from('form_fields').insert([
      { workflow_step_id: step1.id, field_name: 'chief_complaint', field_label: 'Chief Complaint', field_type: 'textarea', is_required: true, field_order: 1 },
      { workflow_step_id: step1.id, field_name: 'duration', field_label: 'Duration of symptoms', field_type: 'text', is_required: false, field_order: 2 }
    ])
  }

  if (step2) {
    await supabase.from('form_fields').insert([
      { workflow_step_id: step2.id, field_name: 'wt', field_label: 'Weight (kg)', field_type: 'number', is_required: true, field_order: 1 },
      { workflow_step_id: step2.id, field_name: 'ht', field_label: 'Height (cm)', field_type: 'number', is_required: true, field_order: 2 },
      { workflow_step_id: step2.id, field_name: 'temp', field_label: 'Temperature (°C)', field_type: 'number', is_required: true, field_order: 3 },
      { workflow_step_id: step2.id, field_name: 'bp', field_label: 'Blood Pressure', field_type: 'text', is_required: true, field_order: 4 },
      { workflow_step_id: step2.id, field_name: 'hr', field_label: 'Heart Rate', field_type: 'number', is_required: true, field_order: 5 },
      { workflow_step_id: step2.id, field_name: 'spo2', field_label: 'SpO2 (%)', field_type: 'number', is_required: false, field_order: 6 },
      { workflow_step_id: step2.id, field_name: 'nurse_notes', field_label: 'Nurse Notes', field_type: 'textarea', is_required: false, field_order: 7 }
    ])
  }

  if (step3) {
    await supabase.from('form_fields').insert([
      { workflow_step_id: step3.id, field_name: 'diagnosis', field_label: 'Diagnosis', field_type: 'textarea', is_required: true, field_order: 1 },
      { workflow_step_id: step3.id, field_name: 'prescription', field_label: 'Prescription / Plan', field_type: 'textarea', is_required: true, field_order: 2 },
      { workflow_step_id: step3.id, field_name: 'icd10', field_label: 'ICD-10 Code', field_type: 'text', is_required: false, field_order: 3 }
    ])
  }

  console.log('Seed complete!')
}

seed().catch(console.error)
