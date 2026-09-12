import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import { useNavigate } from 'react-router-dom'
import OutpatientLegacyForm from '../../components/OutpatientLegacyForm'
import AnimalBiteLegacyForm from '../../components/AnimalBiteLegacyForm'
import TbLegacyForm from '../../components/TbLegacyForm'
import EncodeServiceFormModal from '../../components/EncodeServiceFormModal'
import { isOnline } from '../../lib/offline/connectivity'
import {
  listPatientsCache,
  upsertPatientsCache,
} from '../../lib/offline/patientsCacheService'

export default function HistoricalDataEncoder() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Lookups
  const [patients, setPatients] = useState([])
  const [services, setServices] = useState([])
  const [patientSearch, setPatientSearch] = useState('')

  // Form State
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [selectedServiceId, setSelectedServiceId] = useState('')
  const [dateOfConsultation, setDateOfConsultation] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [assignedDoctorId, setAssignedDoctorId] = useState('')
  const [doctors, setDoctors] = useState([])
  const [showFormModal, setShowFormModal] = useState(false)

  // Dynamic Form State
  const [workflowSteps, setWorkflowSteps] = useState([])
  const [formFields, setFormFields] = useState({}) // step_id -> []
  const [formResponses, setFormResponses] = useState({}) // field_name -> value

  // Selected service details
  const selectedService = useMemo(() => {
    return services.find(s => s.id === selectedServiceId)
  }, [services, selectedServiceId])

  const isOpd = selectedService?.name === 'Outpatient Consultation'
  const isAnimalBite = selectedService?.name === 'Animal Bite (Anti-Rabies Vaccination)' || selectedService?.name === 'Animal Bite'
  const isTb = selectedService?.name === 'Tuberculosis Treatment Services'
  const isLegacyForm = isOpd || isAnimalBite || isTb

  // OPD/Animal Bite Form State
  const [opdForm, setOpdForm] = useState({})


  useEffect(() => {
    loadLookups()
  }, [])

  const loadLookups = async () => {
    setLoading(true)
    try {
      if (!isOnline()) {
        const cached = await listPatientsCache({ limit: 2000 })
        setPatients(
          cached.map((p) => ({
            id: p.id,
            patient_number: p.patient_number,
            first_name: p.first_name,
            last_name: p.last_name,
            middle_name: p.middle_name,
            name: p.name,
          })),
        )
        setServices([])
        setDoctors([])
        setError('Offline — patient list from local cache. Services/doctors need a connection to encode.')
        return
      }

      const [patientsRes, servicesRes, doctorsRes] = await Promise.all([
        supabase.from('patients').select('id, patient_number, first_name, last_name, middle_name, name').order('last_name'),
        supabase.from('services').select('id, name, queue_prefix').eq('is_active', true).order('name'),
        supabase.from('profiles').select('id, first_name, last_name').eq('role', 'Doctor')
      ])

      if (patientsRes.error) throw patientsRes.error
      if (servicesRes.error) throw servicesRes.error

      setPatients(patientsRes.data || [])
      void upsertPatientsCache(patientsRes.data || [])
      
      const allowedServices = ['Tuberculosis Treatment Services', 'Outpatient Consultation', 'Animal Bite (Anti-Rabies Vaccination)']
      setServices((servicesRes.data || []).filter(s => allowedServices.includes(s.name)))
      
      setDoctors(doctorsRes.data || [])
    } catch (err) {
      // Network/API failure: fall back to cached patients so staff can still find IDs
      try {
        const cached = await listPatientsCache({ limit: 2000 })
        if (cached.length) {
          setPatients(
            cached.map((p) => ({
              id: p.id,
              patient_number: p.patient_number,
              first_name: p.first_name,
              last_name: p.last_name,
              middle_name: p.middle_name,
              name: p.name,
            })),
          )
          setError(`${err.message} — showing cached patients.`)
          return
        }
      } catch {
        /* ignore cache errors */
      }
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Load fields when service changes
  useEffect(() => {
    if (!selectedServiceId) {
      setWorkflowSteps([])
      setFormFields({})
      setFormResponses({})
      return
    }

    const loadServiceSchema = async () => {
      setLoading(true)
      try {
        const { data: steps, error: stepsErr } = await supabase
          .from('workflow_steps')
          .select('*')
          .eq('service_id', selectedServiceId)
          .order('step_order', { ascending: true })

        if (stepsErr) throw stepsErr
        
        setWorkflowSteps(steps || [])

        if (steps?.length > 0) {
          const stepIds = steps.map(s => s.id)
          const { data: fields, error: fieldsErr } = await supabase
            .from('form_fields')
            .select('*')
            .in('workflow_step_id', stepIds)
            .order('field_order', { ascending: true })

          if (fieldsErr) throw fieldsErr

          const fieldsMap = {}
          steps.forEach(s => { fieldsMap[s.id] = [] })
          
          fields?.forEach(f => {
            if (fieldsMap[f.workflow_step_id]) {
              fieldsMap[f.workflow_step_id].push(f)
            }
          })
          
          setFormFields(fieldsMap)
        }
      } catch (err) {
        setError('Failed to load service schema: ' + err.message)
      } finally {
        setLoading(false)
      }
    }

    loadServiceSchema()
  }, [selectedServiceId])

  const filteredPatients = useMemo(() => {
    if (!patientSearch) return patients
    const q = patientSearch.toLowerCase()
    return patients.filter(p => {
      const full = `${p.first_name} ${p.last_name}`.toLowerCase()
      const num = p.patient_number?.toLowerCase() || ''
      return full.includes(q) || num.includes(q)
    })
  }, [patients, patientSearch])

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormResponses(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleProceed = () => {
    setError('')
    if (!selectedServiceId) {
      setError('Service Type is required.')
      return
    }
    if (!isLegacyForm && !selectedPatientId) {
      setError('Patient selection is required for this service.')
      return
    }
    if (!dateOfConsultation) {
      setError('Date of consultation is required.')
      return
    }
    setShowFormModal(true)
  }

  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    setError('')
    setSuccess('')

    if (!selectedServiceId) {
      setError('Service Type is required.')
      return
    }

    if (!isLegacyForm && !selectedPatientId) {
      setError('Patient selection is required for this service.')
      return
    }

    setLoading(true)
    try {
      // 1. Create a dummy appointment to link the service_request (since schema requires appointment_id or we can bypass if we make it nullable, but wait, appointment_id is nullable? No, appointment_id is NOT nullable in some older schemas, but let's check. Actually, let's create a completed appointment first to keep referential integrity for reports.)
      
      // 1. Create a dummy appointment to link the service_request
      
      let pt = null
      let patientFullName = 'Patient'
      
      if (!isLegacyForm) {
        const { data: fetchedPt } = await supabase.from('patients').select('id, user_id, first_name, last_name, name').eq('id', selectedPatientId).single()
        pt = fetchedPt
        patientFullName = pt.name || `${pt.first_name || ''} ${pt.last_name || ''}`.trim() || 'Patient'
      } else {
        // For legacy forms, create a dummy patient record based on the form, or lookup by name
        patientFullName = [opdForm.first_name, opdForm.middle_name, opdForm.last_name].filter(Boolean).join(' ').trim() || 'Patient'
        
        const { data: existingPatients } = await supabase.from('patients').select('id, user_id').ilike('name', patientFullName).limit(1)
        
        const patientPayload = {
          name: patientFullName,
          first_name: opdForm.first_name || null,
          middle_name: opdForm.middle_name || null,
          last_name: opdForm.last_name || null,
          philhealth_number: opdForm.philhealth_number || null,
          sex: opdForm.sex || null,
          birthdate: opdForm.birthdate || null,
          mother_maiden_name: opdForm.mother_maiden_name || null,
          civil_status: opdForm.civil_status || null,
          religion: opdForm.religion || null,
          blood_type: opdForm.blood_type || null,
          mobile_phone: opdForm.mobile_phone || null,
          education: opdForm.education || null,
          occupation: opdForm.occupation || null,
          disability: opdForm.disability || null,
          house_no_purok: opdForm.house_no_purok || null,
          barangay: opdForm.barangay || null,
        }

        if (existingPatients && existingPatients.length > 0) {
           pt = { id: existingPatients[0].id, user_id: existingPatients[0].user_id }
           await supabase.from('patients').update(patientPayload).eq('id', pt.id)
        } else {
           const { data: createdPatient, error: createPatientError } = await supabase.from('patients').insert([patientPayload]).select('id').single()
           if (!createPatientError && createdPatient) {
               pt = { id: createdPatient.id, user_id: null }
           } else {
               pt = { id: null, user_id: null }
           }
        }
      }

      const actualDate = isLegacyForm ? (opdForm.date_of_consultation || dateOfConsultation) : dateOfConsultation

      // Resolve legacy schema constraints
      const selectedService = services.find(s => s.id === selectedServiceId)
      const { data: oldSvcType } = await supabase
        .from('service_types')
        .select('id')
        .ilike('name', selectedService?.name || '%Outpatient%')
        .limit(1)
        .maybeSingle()
        
      let legacyServiceTypeId = oldSvcType?.id
      if (!legacyServiceTypeId) {
        const { data: firstOldSvc } = await supabase.from('service_types').select('id').limit(1).maybeSingle()
        legacyServiceTypeId = firstOldSvc?.id
      }

      if (isLegacyForm) {
        // Save directly to patient_records for Outpatient / Animal Bite without creating any dummy appointments
        const sanitizedOpdForm = { ...opdForm }
        Object.keys(sanitizedOpdForm).forEach(k => {
          if (sanitizedOpdForm[k] === '') {
            sanitizedOpdForm[k] = null
          }
        })

        // If it is Animal Bite, format animal bite fields into a structured notes block
        if (isAnimalBite) {
          const biteDetails = `[Animal Bite Record]\nPlace of Bite: ${opdForm.bite_place || ''}\nAnimal Type: ${opdForm.animal_type || ''}\nBite Type: ${opdForm.bite_type || ''}\nBite Site: ${opdForm.bite_site || ''}`
          sanitizedOpdForm.notes = opdForm.notes ? `${biteDetails}\n\nAdditional Notes:\n${opdForm.notes}` : biteDetails
          
          // Clear custom non-schema fields so they don't break the Supabase insert call
          delete sanitizedOpdForm.bite_place
          delete sanitizedOpdForm.animal_type
          delete sanitizedOpdForm.bite_type
          delete sanitizedOpdForm.bite_site
        }

        // If it is TB Treatment, format tuberculosis fields into a structured notes block
        if (isTb) {
          const tbDetails = `[TB Treatment Record]\nNationality: ${opdForm.nationality || ''}\nDiagnosing Facility: ${opdForm.diagnosing_facility || ''}\nNTP Facility Code: ${opdForm.ntp_facility_code || ''}\nProvince/HUC: ${opdForm.facility_province || ''}\nRegion: ${opdForm.facility_region || ''}\nPermanent Address: ${opdForm.permanent_address || ''}\nCurrent Address: ${opdForm.current_address || ''}\nReferred By: ${opdForm.tb_referred_by || ''}\nMode of Screening: ${opdForm.tb_screening_mode || ''}\nDate of Screening: ${opdForm.tb_screening_date || ''}\nLab Xpert Date: ${opdForm.lab_xpert_date || ''}\nLab Xpert Result: ${opdForm.lab_xpert_result || ''}\nLab Smear Date: ${opdForm.lab_smear_date || ''}\nLab Smear Result: ${opdForm.lab_smear_result || ''}\nLab Xray Date: ${opdForm.lab_xray_date || ''}\nLab Xray Result: ${opdForm.lab_xray_result || ''}\nLab TST Date: ${opdForm.lab_tst_date || ''}\nLab TST Result: ${opdForm.lab_tst_result || ''}\nDiagnosis: ${opdForm.tb_diagnosis || ''}\nDate of Diagnosis: ${opdForm.tb_date_of_diagnosis || ''}\nDate of Notification: ${opdForm.tb_date_of_notification || ''}\nTB Case Number: ${opdForm.tb_case_number || ''}\nAttending Physician: ${opdForm.tb_physician || ''}\nReferred To: ${opdForm.tb_referred_to || ''}\nBacteriological Status: ${opdForm.tb_bacteriological_status || ''}\nAnatomical Site: ${opdForm.tb_anatomical_site || ''}\nExtra-pulmonary Site: ${opdForm.tb_extra_pulmonary_site || ''}\nDrug Resistance Status: ${opdForm.tb_drug_resistance || ''}\nRegistration Group: ${opdForm.tb_registration_group || ''}`
          sanitizedOpdForm.notes = opdForm.notes ? `${tbDetails}\n\nAdditional Notes:\n${opdForm.notes}` : tbDetails

          const tbKeys = [
            'nationality', 'diagnosing_facility', 'ntp_facility_code', 'facility_province', 'facility_region',
            'permanent_address', 'current_address', 'tb_referred_by', 'tb_screening_mode',
            'tb_screening_date', 'lab_xpert_date', 'lab_xpert_result', 'lab_smear_date',
            'lab_smear_result', 'lab_xray_date', 'lab_xray_result', 'lab_tst_date',
            'lab_tst_result', 'tb_diagnosis', 'tb_date_of_diagnosis', 'tb_date_of_notification',
            'tb_case_number', 'tb_physician', 'tb_referred_to', 'tb_bacteriological_status',
            'tb_anatomical_site', 'tb_extra_pulmonary_site', 'tb_drug_resistance', 'tb_registration_group'
          ]
          tbKeys.forEach(k => delete sanitizedOpdForm[k])
        }

        const { error: opdErr } = await supabase.from('patient_records').insert({
          patient_id: pt?.id,
          patient_auth_id: pt?.user_id,
          appointment_id: null,
          patient_name: patientFullName,
          date_of_consultation: actualDate,
          assigned_doctor_id: assignedDoctorId || null,
          created_by: user.id,
          workflow_status: 'completed',
          service_type_id: legacyServiceTypeId,
          ...sanitizedOpdForm
        })
        if (opdErr) throw opdErr
      } else {
        // Create a dummy completed appointment to link the service_request for active forms
        const { data: appt, error: apptErr } = await supabase.from('appointments').insert({
          patient_id: pt?.id,
          patient_auth_id: pt?.user_id,
          patient_name: patientFullName,
          appointment_date: actualDate,
          status: 'completed',
          service_type_id: null,
          doctor_queue_status: 'done'
        }).select('id').single()

        if (apptErr) throw apptErr

        // 2. Generate a reference number
        const dateStr = actualDate.replace(/-/g, '').substring(0, 8)
        const random4 = Math.floor(1000 + Math.random() * 9000)
        const refNum = `HIS-${dateStr}-${random4}`

        // 3. Create Service Request
        const { data: sr, error: srErr } = await supabase.from('service_requests').insert({
          appointment_id: appt.id,
          patient_id: pt?.id,
          patient_auth_id: pt?.user_id,
          service_id: selectedServiceId, // New schema
          service_type_id: legacyServiceTypeId, // Legacy schema NOT NULL constraint
          status: 'Completed', // New schema
          current_status: 'completed', // Legacy schema CHECK constraint
          reference_number: refNum,
          created_by: user.id,
          assigned_doctor_id: assignedDoctorId || null,
          created_at: new Date(actualDate).toISOString(),
          updated_at: new Date().toISOString()
        }).select('id').single()

        if (srErr) throw srErr

        // 4. Save form responses for dynamic workflow steps
        const responsesToInsert = []
        
        for (const step of workflowSteps) {
          const fields = formFields[step.id] || []
          
          let stepJson = {}
          fields.forEach(f => {
            if (formResponses[f.field_name] !== undefined) {
              stepJson[f.field_name] = formResponses[f.field_name]
            }
          })

          if (Object.keys(stepJson).length > 0) {
            responsesToInsert.push({
              service_request_id: sr.id,
              workflow_step_id: step.id,
              response_data: stepJson,
              submitted_by: user.id
            })
          }
        }

        if (responsesToInsert.length > 0) {
          const { error: respErr } = await supabase.from('form_responses').insert(responsesToInsert)
          if (respErr) throw respErr
        }
      }

      // Done
      setSuccess('Historical record successfully encoded! Redirecting to Patient Records...')
      setShowFormModal(false)
      setFormResponses({})
      if (isLegacyForm) setOpdForm({})

      
      setTimeout(() => {
        navigate('/dashboard/patient-records')
      }, 1500)
      
    } catch (err) {
      setError('Failed to save record: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const renderField = (field) => {
    const val = formResponses[field.field_name] || ''
    
    switch (field.field_type) {
      case 'textarea':
        return (
          <textarea
            name={field.field_name}
            value={val}
            onChange={handleInputChange}
            required={field.is_required}
            className="field-input min-h-20"
          />
        )
      case 'select':
        return (
          <select
            name={field.field_name}
            value={val}
            onChange={handleInputChange}
            required={field.is_required}
            className="field-input"
          >
            <option value="">Select...</option>
            {(field.options || []).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        )
      default:
        return (
          <input
            type={field.field_type || 'text'}
            name={field.field_name}
            value={val}
            onChange={handleInputChange}
            required={field.is_required}
            className="field-input"
          />
        )
    }
  }

  return (
    <div className="max-w-4xl mx-auto py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Encode Old Records</h1>
          <p className="text-slate-500">Digitize legacy paper records directly into the new workflow engine.</p>
        </div>
        <button
          onClick={() => navigate('/dashboard/patient-records')}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          &larr; Back to Patient Records
        </button>
      </div>

      {error && <div className="error-banner mb-6">{error}</div>}
      {success && <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 font-medium">✓ {success}</div>}

      <div className="space-y-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        
        {/* Step 1: Metadata */}
        <section>
          <h2 className="text-lg font-bold text-slate-900 border-b pb-2 mb-4">1. Record Metadata</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4 md:col-span-2">
              <div>
                <label className="field-label">Service Type *</label>
                <select 
                  className="field-input border-indigo-300 focus:border-indigo-500 focus:ring-indigo-500 bg-indigo-50/30 max-w-md"
                  value={selectedServiceId}
                  onChange={e => setSelectedServiceId(e.target.value)}
                  required
                >
                  <option value="">-- Select Service --</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {!isLegacyForm && selectedServiceId && (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="field-label">Search Patient</label>
                    <input 
                      type="text" 
                      className="field-input" 
                      placeholder="Search by name or ID..."
                      value={patientSearch}
                      onChange={e => setPatientSearch(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-label">Select Patient *</label>
                    <select 
                      className="field-input"
                      value={selectedPatientId}
                      onChange={e => setSelectedPatientId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose Patient --</option>
                      {filteredPatients.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.patient_number ? `[${p.patient_number}] ` : ''}{p.first_name} {p.last_name}
                        </option>
                      ))}
                    </select>
                    {filteredPatients.length === 0 && <p className="text-xs text-amber-600 mt-1">No matching patients found.</p>}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="field-label">Date of Consultation *</label>
                    <input 
                      type="date" 
                      className="field-input"
                      value={dateOfConsultation}
                      onChange={e => setDateOfConsultation(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="field-label">Assigned Doctor (Optional)</label>
                    <select 
                      className="field-input"
                      value={assignedDoctorId}
                      onChange={e => setAssignedDoctorId(e.target.value)}
                    >
                      <option value="">-- None --</option>
                      {doctors.map(d => (
                        <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Proceed Button */}
        <div className="pt-6 border-t border-slate-200 flex justify-end">
          <button 
            type="button" 
            onClick={handleProceed}
            className="primary-btn px-8"
            disabled={loading || !selectedServiceId || (!isLegacyForm && !selectedPatientId)}
          >
            Proceed to Encode
          </button>
        </div>

      </div>

      {showFormModal && (
        <EncodeServiceFormModal
          open={showFormModal}
          onClose={() => setShowFormModal(false)}
          title="2. Encode Service Details"
          serviceKind={isAnimalBite ? 'animal_bite' : isTb ? 'tb' : isOpd ? 'outpatient' : null}
          serviceName={selectedService?.name || ''}
          formData={opdForm}
          onFormChange={setOpdForm}
          saving={loading}
          onSave={() => void handleSubmit()}
          saveLabel="Save Historical Record"
        >
          {isAnimalBite ? (
            <AnimalBiteLegacyForm data={opdForm} onChange={setOpdForm} />
          ) : isTb ? (
            <TbLegacyForm data={opdForm} onChange={setOpdForm} />
          ) : isOpd ? (
            <OutpatientLegacyForm data={opdForm} onChange={setOpdForm} />
          ) : workflowSteps.length > 0 ? (
            <div className="space-y-8">
              {workflowSteps.map((step) => (
                <div key={step.id} className="rounded-xl border border-slate-100 bg-slate-50 p-5">
                  <div className="mb-4">
                    <h3 className="font-semibold text-slate-900">
                      Step {step.step_order}: {step.step_name}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Originally filled by:{' '}
                      <span className="font-medium text-slate-700">{step.target_role}</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {formFields[step.id]?.length > 0 ? (
                      formFields[step.id].map((field) => (
                        <div key={field.id}>
                          <label className="field-label">
                            {field.field_label}{' '}
                            {field.is_required ? <span className="text-rose-500" aria-hidden="true">*</span> : null}
                          </label>
                          {renderField(field)}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm italic text-slate-400">No fields configured for this step.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-slate-500">Loading form schema...</p>
          )}
        </EncodeServiceFormModal>
      )}
    </div>
  )
}
