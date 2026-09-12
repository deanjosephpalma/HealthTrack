import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import OutpatientLegacyForm from '../../components/OutpatientLegacyForm'
import AnimalBiteLegacyForm from '../../components/AnimalBiteLegacyForm'
import TbLegacyForm from '../../components/TbLegacyForm'
import CharterServiceForm from '../../components/CharterServiceForm'
import OfflineDocumentsPanel from '../../components/OfflineDocumentsPanel'
import { resolveCharterKeyFromServiceName } from '../../lib/resolveCharterService'
import {
  saveFormResponseLocal,
  savePatientRecordLocal,
  enqueueServiceRequestUpdate,
} from '../../lib/offline/paperlessService'
import { syncNow } from '../../lib/offline/syncEngine'
import { isOnline } from '../../lib/offline/connectivity'

// Helper component to render a single field (editable or read-only)
function FieldInput({ field, value, onChange, readOnly }) {
  const common = {
    id: field.field_name,
    name: field.field_name,
    className: 'field-input',
    value: value ?? '',
    onChange: (e) => onChange(field.field_name, e.target.value),
    disabled: readOnly,
    required: Boolean(field.is_required) && !readOnly,
  }

  if (field.field_type === 'textarea') {
    return <textarea {...common} rows={3} placeholder={field.field_label} />
  }
  if (field.field_type === 'select' || field.field_type === 'radio') {
    return (
      <select {...common}>
        <option value="">Select…</option>
        {(field.options ?? []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }
  return <input {...common} type={field.field_type || 'text'} placeholder={field.field_label} />
}

export default function ServiceWorkflowPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, role } = useAuth()
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [serviceRequest, setServiceRequest] = useState(null)
  const [patient, setPatient] = useState(null)
  const [workflowSteps, setWorkflowSteps] = useState([])
  const [formFields, setFormFields] = useState([])
  const [formResponses, setFormResponses] = useState({}) // step_id -> response_data
  const [saving, setSaving] = useState(false)

  // Local state for the form currently being edited
  const [editData, setEditData] = useState({})

  // Legacy form state for OPD, Animal Bite, TB
  const [opdForm, setOpdForm] = useState({})

  // Service type detection
  const serviceDisplayName = useMemo(() => {
    return serviceRequest?.services?.name || serviceRequest?.service_types?.name || ''
  }, [serviceRequest])

  const isOpd = useMemo(() => /outpatient/i.test(serviceDisplayName), [serviceDisplayName])
  const isAnimalBite = useMemo(() => /animal\s*bite|anti-?rabies/i.test(serviceDisplayName), [serviceDisplayName])
  const isTb = useMemo(() => /tuberculosis|\btb\b/i.test(serviceDisplayName), [serviceDisplayName])
  const isLegacyForm = useMemo(() => isOpd || isAnimalBite || isTb, [isOpd, isAnimalBite, isTb])
  const charterKey = useMemo(() => resolveCharterKeyFromServiceName(serviceDisplayName), [serviceDisplayName])
  const hasCharterIntake = Boolean(charterKey && !isLegacyForm && serviceRequest?.intake_data)

  useEffect(() => {
    async function loadData() {
      if (!id) return
      setLoading(true)
      
      // 1. Fetch Service Request
      const { data: sr, error: srError } = await supabase
        .from('service_requests')
        .select('*')
        .eq('id', id)
        .single()
        
      if (srError || !sr) {
        setError('Service request not found.')
        setLoading(false)
        return
      }

      if (sr.service_id) {
        const { data: svc } = await supabase.from('services').select('*').eq('id', sr.service_id).single()
        if (svc) sr.services = svc
      }
      if (sr.service_type_id) {
        const { data: st } = await supabase.from('service_types').select('*').eq('id', sr.service_type_id).single()
        if (st) sr.service_types = st
      }

      setServiceRequest(sr)

      if (sr.intake_data && typeof sr.intake_data === 'object') {
        setOpdForm((prev) => ({ ...prev, ...sr.intake_data }))
      }
      
      // 2. Fetch Patient Master Profile
      if (sr.patient_id) {
         const { data: pData } = await supabase
           .from('patients')
           .select('*')
           .eq('id', sr.patient_id)
           .single()
         if (pData) setPatient(pData)
      }
      
      // 3. Fetch Workflow Steps for this service
      const { data: steps } = await supabase
        .from('workflow_steps')
        .select('*')
        .eq('service_id', sr.service_id)
        .order('step_order', { ascending: true })
        
      if (steps) setWorkflowSteps(steps)
      
      // 4. Fetch Form Fields for these steps
      if (steps && steps.length > 0) {
        const stepIds = steps.map(s => s.id)
        const { data: fields } = await supabase
          .from('form_fields')
          .select('*')
          .in('workflow_step_id', stepIds)
          .order('field_order', { ascending: true })
          
        if (fields) setFormFields(fields)
      }
      
      // 5. Fetch Form Responses
      const { data: responses } = await supabase
        .from('form_responses')
        .select('*')
        .eq('service_request_id', id)
        
      if (responses) {
        const respMap = {}
        responses.forEach(r => {
          respMap[r.workflow_step_id] = r.response_data
        })
        setFormResponses(respMap)
      }
      
      setLoading(false)
    }
    
    loadData()
  }, [id])

  // Figure out which step this user should be acting on.
  const activeStep = useMemo(() => {
    if (!workflowSteps.length) return null
    return workflowSteps.find(s => s.target_role === role)
  }, [workflowSteps, role])
  
  // Pre-fill editData when activeStep is found
  useEffect(() => {
    if (activeStep && formResponses[activeStep.id]) {
       setEditData(formResponses[activeStep.id])
    }
  }, [activeStep, formResponses])

  const handleFieldChange = (fieldName, value) => {
    setEditData(prev => ({ ...prev, [fieldName]: value }))
  }

  const handleLegacyFormChange = (data) => {
    setOpdForm(data)
  }

  const handleSaveDraft = async () => {
    if (!activeStep) return { ok: false }
    setSaving(true)
    setError('')

    try {
      const { offline } = await saveFormResponseLocal({
        serviceRequestId: id,
        workflowStepId: activeStep.id,
        responseData: editData,
        submittedBy: user.id,
      })
      setFormResponses((prev) => ({ ...prev, [activeStep.id]: editData }))
      if (isOnline()) await syncNow()
      if (offline) setError('') // clear; success is silent except offline note via banner optional
      setSaving(false)
      return { ok: true, offline }
    } catch (e) {
      setError(e?.message || 'Failed to save draft.')
      setSaving(false)
      return { ok: false, error: e?.message }
    }
  }

  const handleCompleteStep = async () => {
    // Handle legacy form saving
    if (isLegacyForm) {
      setSaving(true)
      setError('')
      try {
        const sanitizedOpdForm = { ...opdForm }
        Object.keys(sanitizedOpdForm).forEach((k) => {
          if (sanitizedOpdForm[k] === '') {
            sanitizedOpdForm[k] = null
          }
        })

        if (isAnimalBite) {
          const biteDetails = `[Animal Bite Record]\nPlace of Bite: ${opdForm.bite_place || ''}\nAnimal Type: ${opdForm.animal_type || ''}\nBite Type: ${opdForm.bite_type || ''}\nBite Site: ${opdForm.bite_site || ''}`
          sanitizedOpdForm.notes = opdForm.notes ? `${biteDetails}\n\nAdditional Notes:\n${opdForm.notes}` : biteDetails

          delete sanitizedOpdForm.bite_place
          delete sanitizedOpdForm.animal_type
          delete sanitizedOpdForm.bite_type
          delete sanitizedOpdForm.bite_site
        }

        if (isTb) {
          const tbDetails = `[TB Treatment Record]\nNationality: ${opdForm.nationality || ''}\nDiagnosing Facility: ${opdForm.diagnosing_facility || ''}\nNTP Facility Code: ${opdForm.ntp_facility_code || ''}\nProvince/HUC: ${opdForm.facility_province || ''}\nRegion: ${opdForm.facility_region || ''}\nPermanent Address: ${opdForm.permanent_address || ''}\nCurrent Address: ${opdForm.current_address || ''}\nReferred By: ${opdForm.tb_referred_by || ''}\nMode of Screening: ${opdForm.tb_screening_mode || ''}\nDate of Screening: ${opdForm.tb_screening_date || ''}\nLab Xpert Date: ${opdForm.lab_xpert_date || ''}\nLab Xpert Result: ${opdForm.lab_xpert_result || ''}\nLab Smear Date: ${opdForm.lab_smear_date || ''}\nLab Smear Result: ${opdForm.lab_smear_result || ''}\nLab Xray Date: ${opdForm.lab_xray_date || ''}\nLab Xray Result: ${opdForm.lab_xray_result || ''}\nLab TST Date: ${opdForm.lab_tst_date || ''}\nLab TST Result: ${opdForm.lab_tst_result || ''}\nDiagnosis: ${opdForm.tb_diagnosis || ''}\nDate of Diagnosis: ${opdForm.tb_date_of_diagnosis || ''}\nDate of Notification: ${opdForm.tb_date_of_notification || ''}\nTB Case Number: ${opdForm.tb_case_number || ''}\nAttending Physician: ${opdForm.tb_physician || ''}\nReferred To: ${opdForm.tb_referred_to || ''}\nBacteriological Status: ${opdForm.tb_bacteriological_status || ''}\nAnatomical Site: ${opdForm.tb_anatomical_site || ''}\nExtra-pulmonary Site: ${opdForm.tb_extra_pulmonary_site || ''}\nDrug Resistance Status: ${opdForm.tb_drug_resistance || ''}\nRegistration Group: ${opdForm.tb_registration_group || ''}`
          sanitizedOpdForm.notes = opdForm.notes ? `${tbDetails}\n\nAdditional Notes:\n${opdForm.notes}` : tbDetails

          const tbKeys = [
            'nationality',
            'diagnosing_facility',
            'ntp_facility_code',
            'facility_province',
            'facility_region',
            'permanent_address',
            'current_address',
            'tb_referred_by',
            'tb_screening_mode',
            'tb_screening_date',
            'lab_xpert_date',
            'lab_xpert_result',
            'lab_smear_date',
            'lab_smear_result',
            'lab_xray_date',
            'lab_xray_result',
            'lab_tst_date',
            'lab_tst_result',
            'tb_diagnosis',
            'tb_date_of_diagnosis',
            'tb_date_of_notification',
            'tb_case_number',
            'tb_physician',
            'tb_referred_to',
            'tb_bacteriological_status',
            'tb_anatomical_site',
            'tb_extra_pulmonary_site',
            'tb_drug_resistance',
            'tb_registration_group',
          ]
          tbKeys.forEach((k) => delete sanitizedOpdForm[k])
        }

        const nowIso = new Date().toISOString()
        await savePatientRecordLocal({
          id: crypto.randomUUID(),
          patient_id: patient?.id,
          patient_auth_id: patient?.user_id,
          appointment_id: serviceRequest.appointment_id,
          patient_name: patient?.name || 'Patient',
          date_of_consultation: nowIso.split('T')[0],
          assigned_doctor_id: user.id,
          created_by: user.id,
          workflow_status: 'completed',
          service_type_id: serviceRequest.service_type_id,
          ...sanitizedOpdForm,
        })

        const statusPatch = { status: 'Completed', updated_at: nowIso }
        if (isOnline()) {
          await supabase.from('service_requests').update(statusPatch).eq('id', id)
          await syncNow()
        } else {
          await enqueueServiceRequestUpdate(id, statusPatch)
        }

        setSaving(false)
        navigate('/dashboard/workflow')
        return
      } catch (err) {
        setError('Failed to save record: ' + err.message)
        setSaving(false)
        return
      }
    }

    // Handle dynamic workflow form saving
    const draftResult = await handleSaveDraft()
    if (!draftResult?.ok) return

    setSaving(true)

    let newStatus = 'Completed'

    if (activeStep) {
      const currentOrder = activeStep.step_order
      const nextStep = workflowSteps.find((s) => s.step_order > currentOrder)
      if (nextStep) {
        if (nextStep.target_role === 'Doctor') newStatus = 'For Doctor'
        else if (nextStep.target_role === 'Nurse') newStatus = 'For Nurse'
        else if (nextStep.target_role === 'Staff') newStatus = 'For Staff Releasing'
        else newStatus = `For ${nextStep.target_role}`
      }
    }

    const nowIso = new Date().toISOString()
    const statusPatch = { status: newStatus, updated_at: nowIso }

    if (isOnline()) {
      await supabase.from('service_requests').update(statusPatch).eq('id', id)
      await supabase.from('workflow_status_logs').insert({
        service_request_id: id,
        previous_status: serviceRequest.status,
        new_status: newStatus,
        changed_by: user.id,
      })
      await syncNow()
    } else {
      await enqueueServiceRequestUpdate(id, statusPatch)
    }

    setSaving(false)
    navigate('/dashboard/workflow')
  }

  if (loading) return <div className="p-8 text-center text-slate-500">Loading Workflow...</div>
  if (!serviceRequest) return <div className="p-8 text-center text-red-500">{error || 'Not found'}</div>

  // Render a step (read-only or editable)
  const renderStep = (step) => {
    const isEditable = activeStep?.id === step.id
    const fieldsForStep = formFields.filter(f => f.workflow_step_id === step.id)
    if (fieldsForStep.length === 0) return null

    // For read-only steps, if there's no response yet, just say so.
    const stepResponse = isEditable ? editData : (formResponses[step.id] ?? null)
    
    if (!isEditable && !stepResponse) {
       return (
         <div key={step.id} className="mb-6 rounded-xl border border-slate-200 bg-white p-5 opacity-60">
           <h3 className="font-semibold text-slate-800">{step.step_name} ({step.target_role})</h3>
           <p className="text-sm text-slate-500 mt-2">Not completed yet.</p>
         </div>
       )
    }

    return (
      <div key={step.id} className={`mb-6 rounded-xl border p-5 ${isEditable ? 'border-teal-300 bg-teal-50/30' : 'border-slate-200 bg-white'}`}>
        <div className="flex justify-between items-center mb-4">
           <h3 className={`font-bold ${isEditable ? 'text-teal-900' : 'text-slate-800'}`}>
             {step.step_name} <span className="text-sm font-normal text-slate-500">({step.target_role})</span>
           </h3>
           {isEditable && <span className="text-xs font-semibold uppercase tracking-wider text-teal-700 bg-teal-100 px-2 py-1 rounded">Active Step</span>}
        </div>
        
        <div className="grid gap-4 sm:grid-cols-2">
          {fieldsForStep.map(field => {
             // Basic conditional logic (simplified)
             if (field.conditional_logic) {
                // e.g. {"dependsOn": "sex", "value": "Female"}
                // We check if the patient's master profile sex matches
                try {
                  const logic = typeof field.conditional_logic === 'string' ? JSON.parse(field.conditional_logic) : field.conditional_logic
                  if (logic.dependsOn === 'sex' && logic.value) {
                     if ((patient?.sex || '').toLowerCase() !== logic.value.toLowerCase()) {
                        return null // hide field
                     }
                  }
                } catch {
                  // ignore parse error
                }
             }
             
             return (
               <div key={field.id} className={field.field_type === 'textarea' ? 'sm:col-span-2' : ''}>
                 <label className="field-label text-xs uppercase tracking-wider text-slate-500 mb-1 block">
                   {field.field_label}{' '}
                   {field.is_required && isEditable ? <span className="text-rose-500" aria-hidden="true">*</span> : null}
                 </label>
                 <FieldInput 
                    field={field} 
                    value={stepResponse?.[field.field_name]} 
                    onChange={handleFieldChange} 
                    readOnly={!isEditable} 
                 />
               </div>
             )
          })}
        </div>
        
        {isEditable && (
          <div className="mt-6 flex flex-wrap gap-3">
             <button type="button" onClick={handleSaveDraft} disabled={saving} className="secondary-btn !mt-0">
               {saving ? 'Saving...' : 'Save Draft'}
             </button>
             <button type="button" onClick={handleCompleteStep} disabled={saving} className="primary-btn !mt-0 bg-teal-700 hover:bg-teal-600">
               Complete Step
             </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="patient-panel-eyebrow">Service Workflow</p>
          <h2 className="module-title">{serviceRequest.services?.name}</h2>
          <p className="text-sm text-slate-600">Ref: {serviceRequest.reference_number} • Status: <span className="font-bold">{serviceRequest.status}</span></p>
        </div>
        <button onClick={() => navigate('/dashboard/workflow')} className="secondary-btn text-sm">
           &larr; Back to Workflow
        </button>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        
        {/* Left Column: Patient Master Profile Summary */}
        <div className="lg:col-span-1">
           <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
             <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 border-b pb-2 mb-3">Master Patient Profile</h3>
             {patient ? (
               <div className="space-y-3 text-sm">
                 <div><span className="text-slate-500 block text-xs">Name</span><span className="font-semibold text-slate-900">{patient.name}</span></div>
                 <div><span className="text-slate-500 block text-xs">PhilHealth No.</span><span className="text-slate-900">{patient.philhealth_number || '—'}</span></div>
                 <div className="grid grid-cols-2 gap-2">
                   <div><span className="text-slate-500 block text-xs">Birthdate</span><span className="text-slate-900">{patient.birthdate || '—'}</span></div>
                   <div><span className="text-slate-500 block text-xs">Age</span><span className="text-slate-900">{patient.age || '—'}</span></div>
                 </div>
                 <div className="grid grid-cols-2 gap-2">
                   <div><span className="text-slate-500 block text-xs">Sex</span><span className="text-slate-900">{patient.sex || '—'}</span></div>
                   <div><span className="text-slate-500 block text-xs">Blood Type</span><span className="text-slate-900">{patient.blood_type || '—'}</span></div>
                 </div>
                 <div><span className="text-slate-500 block text-xs">Mobile</span><span className="text-slate-900">{patient.mobile_phone || '—'}</span></div>
                 <div><span className="text-slate-500 block text-xs">Address</span><span className="text-slate-900">{[patient.house_no_purok, patient.barangay, patient.municipality, patient.province].filter(Boolean).join(', ') || '—'}</span></div>
               </div>
             ) : (
               <p className="text-sm text-slate-500">Patient profile not found.</p>
             )}
           </div>
           
           <div className="mt-4">
             <OfflineDocumentsPanel
               serviceRequestId={id}
               patientAuthId={patient?.user_id}
               patientId={patient?.id}
               uploadedBy={user?.id}
               title="Patient documents"
             />
           </div>
        </div>
        
        {/* Right Column: Workflow Steps or Legacy Forms */}
        <div className="lg:col-span-2">
           {error && <p className="error-banner mb-4">{error}</p>}
           
           {isLegacyForm ? (
             <div className="space-y-6">
               <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                 <h3 className="text-lg font-bold text-slate-900 mb-4">
                   {isAnimalBite ? 'Animal Bite Record' : isTb ? 'Tuberculosis Treatment Record' : 'Outpatient Consultation Record'}
                 </h3>
                 {isAnimalBite ? (
                   <AnimalBiteLegacyForm data={opdForm} onChange={handleLegacyFormChange} />
                 ) : isTb ? (
                   <TbLegacyForm data={opdForm} onChange={handleLegacyFormChange} />
                 ) : (
                   <OutpatientLegacyForm data={opdForm} onChange={handleLegacyFormChange} />
                 )}
               </div>
               <div className="flex flex-wrap gap-3">
                 <button type="button" onClick={handleCompleteStep} disabled={saving} className="primary-btn !mt-0 bg-teal-700 hover:bg-teal-600">
                   {saving ? 'Saving...' : 'Save Record & Complete'}
                 </button>
               </div>
             </div>
           ) : hasCharterIntake ? (
             <div className="space-y-6">
               <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
                 <h3 className="mb-4 text-lg font-bold text-slate-900">Patient intake form</h3>
                 <CharterServiceForm
                   serviceName={serviceDisplayName}
                   charterKey={charterKey}
                   data={serviceRequest.intake_data || {}}
                   readOnly
                 />
               </div>
               {workflowSteps.map(step => renderStep(step))}
             </div>
           ) : (
             <>
               {workflowSteps.map(step => renderStep(step))}
               
               {!activeStep && serviceRequest.status !== 'Completed' && (
                  <div className="info-banner text-center mt-4">
                     Your role ({role}) does not have an active step in this workflow.
                  </div>
               )}
             </>
           )}
        </div>
        
      </div>
    </section>
  )
}
