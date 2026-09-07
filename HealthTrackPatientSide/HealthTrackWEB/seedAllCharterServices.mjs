import * as dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const SERVICES = [
  {
    name: 'Animal Bite (Anti-Rabies Vaccination)',
    description: 'Vaccine given to constituents bitten by animals particularly dogs and cats.',
    queue_prefix: 'ABV',
    estimated_duration_mins: 10,
    steps: [
      { order: 1, name: 'Registration', role: 'Staff', desc: 'Register patient' },
      { order: 2, name: 'Vaccination Proper', role: 'Nurse', desc: 'Intervention / Vaccination proper' }
    ]
  },
  {
    name: 'Outpatient Consultation',
    description: 'Outpatient Consultation in the Municipal Health Office.',
    queue_prefix: 'OPD',
    estimated_duration_mins: 25,
    steps: [
      { order: 1, name: 'Obtaining of vital signs', role: 'Nurse', desc: 'Checking of vital signs' },
      { order: 2, name: 'Consultation', role: 'Doctor', desc: 'Consultation proper' }
    ]
  },
  {
    name: 'Issuance of Exhumation, Cremation, Transfer Permit',
    description: 'Issuance of death related permits.',
    queue_prefix: 'ECT',
    estimated_duration_mins: 15,
    steps: [
      { order: 1, name: 'Evaluation of Documents', role: 'Staff', desc: 'Review submitted documents' },
      { order: 2, name: 'Review and Approval', role: 'Doctor', desc: 'Final review and signature' }
    ]
  },
  {
    name: 'Review of Death Certificate',
    description: 'Review of Death Certificate details before final issuance.',
    queue_prefix: 'RDC',
    estimated_duration_mins: 10,
    steps: [
      { order: 1, name: 'Evaluation', role: 'Nurse', desc: 'Print/prepare exhumation and transfer permit' },
      { order: 2, name: 'Approval', role: 'Doctor', desc: 'Receiving of permit' }
    ]
  },
  {
    name: 'Issuance of Health Card for Food and Non-Food Establishments',
    description: 'Issuance of Health Card after examination.',
    queue_prefix: 'IHC',
    estimated_duration_mins: 10,
    steps: [
      { order: 1, name: 'Examination & Waiting', role: 'Nurse', desc: 'Waiting for further examination' },
      { order: 2, name: 'Approval & Release', role: 'Doctor', desc: 'Payment and receiving of health card' }
    ]
  },
  {
    name: 'Issuance of Medical Certificate',
    description: 'Issuance of standard Medical Certificate.',
    queue_prefix: 'IMC',
    estimated_duration_mins: 5,
    steps: [
      { order: 1, name: 'Evaluation of Data', role: 'Staff', desc: 'Request for a certificate' },
      { order: 2, name: 'Encoding & Approval', role: 'Doctor', desc: 'Waiting / Encoding and printing of Data' }
    ]
  },
  {
    name: 'Issuance of Sanitary Permit',
    description: 'Processing and releasing of Sanitary Permit.',
    queue_prefix: 'ISP',
    estimated_duration_mins: 25,
    steps: [
      { order: 1, name: 'Evaluation', role: 'Staff', desc: 'Submission of documentary requirements' },
      { order: 2, name: 'Processing & Releasing', role: 'Nurse', desc: 'Processing and releasing of sanitary permit' }
    ]
  },
  {
    name: 'Tuberculosis Treatment Services',
    description: 'Consultation and dispensing of TB medicine.',
    queue_prefix: 'TBS',
    estimated_duration_mins: 15,
    steps: [
      { order: 1, name: 'Vital Signs & Assessment', role: 'Nurse', desc: 'Vital signs and initial assessment' },
      { order: 2, name: 'Consultation Proper', role: 'Doctor', desc: 'TB Diagnosis and plan' },
      { order: 3, name: 'Receiving Medicine', role: 'Staff', desc: 'Receiving of medicine or treatment pack' }
    ]
  },
  {
    name: 'Pre-marriage Counseling',
    description: 'Counseling and issuance of Certificate of Compliance.',
    queue_prefix: 'PMC',
    estimated_duration_mins: 200,
    steps: [
      { order: 1, name: 'Counseling', role: 'Staff', desc: 'Attend pre-marriage counseling' },
      { order: 2, name: 'Certification', role: 'Doctor', desc: 'Processing and issuance of certificate of compliance' }
    ]
  }
]

const FORM_FIELDS = {
  // 1. Animal Bite
  'Animal Bite (Anti-Rabies Vaccination)_1': [
    { name: 'chief_complaint', label: 'Chief Complaint', type: 'textarea', required: true },
    { name: 'biting_animal', label: 'Biting Animal (Dog, Cat, etc.)', type: 'text', required: true }
  ],
  'Animal Bite (Anti-Rabies Vaccination)_2': [
    { name: 'date_given', label: 'Date Given', type: 'date', required: true },
    { name: 'dose_number', label: 'Dose Number (e.g. Dose 1)', type: 'select', options: ['Dose 1', 'Dose 2', 'Dose 3', 'Dose 4', 'Booster'], required: true },
    { name: 'route', label: 'Route', type: 'select', options: ['Intramuscular (IM)', 'Intradermal (ID)'], required: true },
    { name: 'next_due', label: 'Next Due Date', type: 'date', required: false }
  ],
  
  // 2. Outpatient Consultation
  'Outpatient Consultation_1': [
    { name: 'wt', label: 'Weight (kg)', type: 'number', required: true },
    { name: 'ht', label: 'Height (cm)', type: 'number', required: true },
    { name: 'temp', label: 'Temperature (°C)', type: 'number', required: true },
    { name: 'bp', label: 'Blood Pressure', type: 'text', required: true },
    { name: 'hr', label: 'Heart Rate', type: 'number', required: true },
    { name: 'nurse_notes', label: 'Notes', type: 'textarea', required: false }
  ],
  'Outpatient Consultation_2': [
    { name: 'diagnosis', label: 'Diagnosis', type: 'textarea', required: true },
    { name: 'prescription', label: 'Prescription / Plan', type: 'textarea', required: true },
    { name: 'icd10', label: 'ICD-10 Code', type: 'text', required: false }
  ],

  // 3. ECT Permit
  'Issuance of Exhumation, Cremation, Transfer Permit_1': [
    { name: 'requirements_checklist', label: 'Requirements Complete?', type: 'select', options: ['Yes', 'No'], required: true }
  ],
  'Issuance of Exhumation, Cremation, Transfer Permit_2': [
    { name: 'approval_status', label: 'Approval Status', type: 'select', options: ['Approved', 'Rejected'], required: true },
    { name: 'notes', label: 'Notes', type: 'textarea', required: false }
  ],

  // 4. Death Certificate
  'Review of Death Certificate_1': [
    { name: 'initial_review', label: 'Initial Review Notes', type: 'textarea', required: true }
  ],
  'Review of Death Certificate_2': [
    { name: 'final_approval', label: 'Final Approval', type: 'select', options: ['Approved', 'Needs Revision'], required: true },
    { name: 'doctor_notes', label: 'Doctor Notes', type: 'textarea', required: false }
  ],

  // 5. Health Card
  'Issuance of Health Card for Food and Non-Food Establishments_1': [
    { name: 'lab_results_review', label: 'Lab Results Review', type: 'select', options: ['Normal', 'Abnormal'], required: true },
    { name: 'exam_notes', label: 'Physical Exam Notes', type: 'textarea', required: false }
  ],
  'Issuance of Health Card for Food and Non-Food Establishments_2': [
    { name: 'approval_status', label: 'Approval Status', type: 'select', options: ['Approved', 'Declined'], required: true }
  ],

  // 6. Medical Certificate
  'Issuance of Medical Certificate_1': [
    { name: 'purpose', label: 'Purpose of Request', type: 'text', required: true }
  ],
  'Issuance of Medical Certificate_2': [
    { name: 'medical_details', label: 'Medical Details / Findings', type: 'textarea', required: true },
    { name: 'approval_status', label: 'Approval Status', type: 'select', options: ['Approved', 'Declined'], required: true }
  ],

  // 7. Sanitary Permit
  'Issuance of Sanitary Permit_1': [
    { name: 'compliance_checklist', label: 'Compliance Checklist', type: 'select', options: ['Complete', 'Incomplete'], required: true }
  ],
  'Issuance of Sanitary Permit_2': [
    { name: 'inspection_notes', label: 'Inspection Notes', type: 'textarea', required: true }
  ],

  // 8. Tuberculosis Treatment Services
  'Tuberculosis Treatment Services_1': [
    { name: 'wt', label: 'Weight (kg)', type: 'number', required: true },
    { name: 'bp', label: 'Blood Pressure', type: 'text', required: true },
    { name: 'cough_duration', label: 'Duration of Cough (Weeks)', type: 'number', required: true },
    { name: 'screening_notes', label: 'Screening Notes', type: 'textarea', required: false }
  ],
  'Tuberculosis Treatment Services_2': [
    { name: 'diagnosis', label: 'Diagnosis', type: 'textarea', required: true },
    { name: 'dots_category', label: 'DOTS Category', type: 'select', options: ['Category I', 'Category II', 'Category III', 'Category IV'], required: true },
    { name: 'prescription', label: 'Prescription / Plan', type: 'textarea', required: true }
  ],
  'Tuberculosis Treatment Services_3': [
    { name: 'medicine_released', label: 'Medicine Released?', type: 'select', options: ['Yes', 'No'], required: true },
    { name: 'next_visit', label: 'Next Visit Date', type: 'date', required: false }
  ],

  // 9. Pre-marriage Counseling
  'Pre-marriage Counseling_1': [
    { name: 'counseling_notes', label: 'Counseling Notes', type: 'textarea', required: true }
  ],
  'Pre-marriage Counseling_2': [
    { name: 'certificate_status', label: 'Certificate of Compliance Status', type: 'select', options: ['Issued', 'Pending'], required: true }
  ]
}


async function runSeeder() {
  console.log('🚀 Starting Citizen\'s Charter Data Seed...')

  for (const srv of SERVICES) {
    // 1. Insert or get Service
    let { data: service, error: srvErr } = await supabase.from('services').insert({
      name: srv.name,
      description: srv.description,
      queue_prefix: srv.queue_prefix,
      estimated_duration_mins: srv.estimated_duration_mins
    }).select('id').single()

    if (srvErr) {
      if (srvErr.code === '23505') {
        const { data: existing } = await supabase.from('services').select('id').eq('name', srv.name).single()
        if (existing) service = existing
      } else {
        console.error(`Error inserting service ${srv.name}:`, srvErr)
        continue
      }
    }

    if (!service) continue
    console.log(`✅ Synced Service: ${srv.name}`)

    for (const step of srv.steps) {
      // 2. Insert or update Step
      let { data: workflowStep, error: stepErr } = await supabase.from('workflow_steps').upsert({
        service_id: service.id,
        step_order: step.order,
        step_name: step.name,
        target_role: step.role,
        description: step.desc
      }, { onConflict: 'service_id,step_order' }).select('id').single()

      if (stepErr || !workflowStep) {
        console.error(`   Error upserting step ${step.order} for ${srv.name}:`, stepErr)
        continue
      }
      console.log(`   - Synced Step: ${step.order}. ${step.name} (${step.role})`)

      // 3. Insert Fields
      const fieldsKey = `${srv.name}_${step.order}`
      const fields = FORM_FIELDS[fieldsKey]
      
      if (fields) {
        // First delete existing fields for this step to avoid duplicates
        await supabase.from('form_fields').delete().eq('workflow_step_id', workflowStep.id)
        
        let order = 1
        for (const field of fields) {
          const { error: fieldErr } = await supabase.from('form_fields').insert({
            workflow_step_id: workflowStep.id,
            field_name: field.name,
            field_label: field.label,
            field_type: field.type,
            options: field.options || null,
            is_required: field.required,
            field_order: order++
          })
          
          if (fieldErr) {
            console.error(`     Error inserting field ${field.name}:`, fieldErr)
          }
        }
        console.log(`     -> Inserted ${fields.length} form fields`)
      }
    }
  }

  console.log('🎉 Seeding Complete!')
}

runSeeder().catch(console.error)
