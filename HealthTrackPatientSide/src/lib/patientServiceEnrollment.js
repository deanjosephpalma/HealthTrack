import { supabase } from './supabaseClient'
import { isOnline } from './offline/connectivity'
import { saveFormResponseLocal, enqueueServiceRequestUpdate } from './offline/paperlessService'
import { syncPatientQueue } from './offline/syncEngine'

export const STORAGE_SERVICE_ID = 'healthtrack_selected_service_type_id'
export const STORAGE_SERVICE_NAME = 'healthtrack_selected_service_type_name'
export const STORAGE_SERVICE_CODE = 'healthtrack_selected_service_type_code'

const TERMINAL_STATUSES = '(Cancelled,Rejected,Completed)'

export function readPendingServiceSelection() {
  return {
    serviceId: (sessionStorage.getItem(STORAGE_SERVICE_ID) ?? '').trim() || null,
    serviceName: (sessionStorage.getItem(STORAGE_SERVICE_NAME) ?? '').trim() || null,
  }
}

export function writePendingServiceSelection({ serviceId, serviceName, serviceCode }) {
  if (serviceId) sessionStorage.setItem(STORAGE_SERVICE_ID, serviceId)
  else sessionStorage.removeItem(STORAGE_SERVICE_ID)

  if (serviceName) sessionStorage.setItem(STORAGE_SERVICE_NAME, serviceName)
  else sessionStorage.removeItem(STORAGE_SERVICE_NAME)

  if (serviceCode) sessionStorage.setItem(STORAGE_SERVICE_CODE, serviceCode)
  else sessionStorage.removeItem(STORAGE_SERVICE_CODE)
}

export function clearPendingServiceSelection() {
  sessionStorage.removeItem(STORAGE_SERVICE_ID)
  sessionStorage.removeItem(STORAGE_SERVICE_NAME)
  sessionStorage.removeItem(STORAGE_SERVICE_CODE)
}

const REQUEST_SELECT = `
  id,
  patient_id,
  service_type_id,
  status,
  created_at,
  updated_at,
  service_types ( id, name, description, queue_prefix )
`

/** True when master profile has enough fields for walk-in queue (no forced intake). */
export async function hasUsablePatientProfile(patientId) {
  if (!patientId) return false
  const { data } = await supabase
    .from('patients')
    .select('first_name, last_name, birthdate, sex, barangay, mobile_phone, phone')
    .eq('id', patientId)
    .maybeSingle()
  if (!data) return false
  const phone = (data.mobile_phone || data.phone || '').toString().trim()
  return Boolean(
    (data.first_name || '').toString().trim() &&
      (data.last_name || '').toString().trim() &&
      data.birthdate &&
      (data.sex || '').toString().trim() &&
      (data.barangay || '').toString().trim() &&
      phone,
  )
}

export async function fetchActiveEnrollment(patientAuthId) {
  if (!patientAuthId) return null

  // Get the patient_id — retry up to 3 times to handle post-insert race conditions
  let patient = null
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await supabase.from('patients').select('id').eq('patient_auth_id', patientAuthId).maybeSingle()
    if (data) {
      patient = data
      break
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 250))
  }
  if (!patient) return null

  // Prefer Draft/Ready for the next visit; avoid sticking on an old In Queue row
  // after the queue ticket is already completed.
  const { data: preferred, error: preferredError } = await supabase
    .from('service_requests')
    .select(REQUEST_SELECT)
    .eq('patient_id', patient.id)
    .in('status', ['Draft', 'Ready'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (preferredError) throw new Error(preferredError.message)
  if (preferred) return preferred

  const { data, error } = await supabase
    .from('service_requests')
    .select(REQUEST_SELECT)
    .eq('patient_id', patient.id)
    .not('status', 'in', TERMINAL_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ?? null
}

export async function enrollPatientInService(patientAuthId, serviceId) {
  if (!patientAuthId || !serviceId) {
    console.warn('[enrollPatientInService] missing patientAuthId or serviceId', { patientAuthId, serviceId })
    return { ok: false, error: 'Service selection is required.' }
  }

  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('id')
    .eq('patient_auth_id', patientAuthId)
    .maybeSingle()
  console.log('[enrollPatientInService] patient lookup:', { patient, patientError, patientAuthId })

  if (!patient) {
    console.log('[enrollPatientInService] patient not found, storing selection for later')
    const { data: service } = await supabase
      .from('service_types')
      .select('id, name, queue_prefix')
      .eq('id', serviceId)
      .maybeSingle()
    if (service) {
      writePendingServiceSelection({
        serviceId: service.id,
        serviceName: service.name,
        serviceCode: service.queue_prefix,
      })
    }
    return {
      ok: true,
      pendingPatientCreation: true,
      message: 'Service selected. Your profile will be created when you log in.',
    }
  }

  const { data: service, error: serviceError } = await supabase
    .from('service_types')
    .select('id, name')
    .eq('id', serviceId)
    .maybeSingle()

  console.log('[enrollPatientInService] service lookup:', { service, serviceError, serviceId })
  if (serviceError) return { ok: false, error: serviceError.message }
  if (!service) return { ok: false, error: 'Selected service was not found.' }

  // Reuse existing Draft/Ready for the same service
  const { data: existingSame } = await supabase
    .from('service_requests')
    .select(REQUEST_SELECT)
    .eq('patient_id', patient.id)
    .eq('service_type_id', serviceId)
    .in('status', ['Draft', 'Ready'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingSame) {
    const profileReady = await hasUsablePatientProfile(patient.id)
    if (existingSame.status === 'Draft' && profileReady) {
      const { data: promoted, error: promoteError } = await supabase
        .from('service_requests')
        .update({ status: 'Ready', updated_at: new Date().toISOString() })
        .eq('id', existingSame.id)
        .select(REQUEST_SELECT)
        .single()
      if (!promoteError && promoted) {
        clearPendingServiceSelection()
        return { ok: true, enrollment: promoted }
      }
    }
    clearPendingServiceSelection()
    return { ok: true, enrollment: existingSame }
  }

  // Close other unfinished enrollments so switching services is not blocked
  await supabase
    .from('service_requests')
    .update({ status: 'Cancelled', updated_at: new Date().toISOString() })
    .eq('patient_auth_id', patientAuthId)
    .in('status', ['Draft', 'Ready'])

  const profileReady = await hasUsablePatientProfile(patient.id)
  const initialStatus = profileReady ? 'Ready' : 'Draft'

  const referenceNumber = `SRV-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
  const { data, error } = await supabase
    .from('service_requests')
    .insert([
      {
        patient_id: patient.id,
        patient_auth_id: patientAuthId,
        service_type_id: serviceId,
        status: initialStatus,
        reference_number: referenceNumber,
      },
    ])
    .select(REQUEST_SELECT)
    .single()

  if (error) return { ok: false, error: error.message }

  clearPendingServiceSelection()
  return { ok: true, enrollment: data }
}

export async function enrollFromSessionSelection(patientAuthId) {
  const pending = readPendingServiceSelection()
  console.log('[enrollFromSessionSelection] pending:', pending, 'patientAuthId:', patientAuthId)
  if (!pending.serviceId) {
    if (pending.serviceName) {
      const { data: svc } = await supabase
        .from('service_types')
        .select('id')
        .ilike('name', `%${pending.serviceName}%`)
        .limit(1)
        .maybeSingle()
      if (svc?.id) {
        console.log('[enrollFromSessionSelection] found service by name fallback:', svc.id)
        return enrollPatientInService(patientAuthId, svc.id)
      }
    }
    return { ok: false, skipped: true }
  }
  return enrollPatientInService(patientAuthId, pending.serviceId)
}

export async function saveEnrollmentIntake(serviceRequestId, intakeData, workflowStepId) {
  const now = new Date().toISOString()

  if (workflowStepId) {
    await saveFormResponseLocal({
      serviceRequestId,
      workflowStepId,
      responseData: intakeData,
    })
  }

  const patch = {
    status: 'Ready',
    updated_at: now,
  }
  const patchWithIntake = {
    ...patch,
    ...(intakeData ? { intake_data: intakeData } : {}),
  }

  if (isOnline()) {
    if (workflowStepId) {
      await supabase.from('form_responses').upsert(
        {
          service_request_id: serviceRequestId,
          workflow_step_id: workflowStepId,
          response_data: intakeData,
          updated_at: now,
        },
        { onConflict: 'service_request_id,workflow_step_id' },
      )
    }

    let { data, error } = await supabase
      .from('service_requests')
      .update(patchWithIntake)
      .eq('id', serviceRequestId)
      .select(REQUEST_SELECT)
      .single()

    // Fallback if intake_data column is not yet migrated
    if (error && /intake_data/i.test(error.message || '')) {
      ;({ data, error } = await supabase
        .from('service_requests')
        .update(patch)
        .eq('id', serviceRequestId)
        .select(REQUEST_SELECT)
        .single())
    }

    if (error) {
      await enqueueServiceRequestUpdate(serviceRequestId, patchWithIntake)
      return {
        ok: true,
        offline: true,
        enrollment: { id: serviceRequestId, status: 'Ready', updated_at: now, intake_data: intakeData },
        error: error.message,
      }
    }

    void syncPatientQueue()
    return { ok: true, enrollment: data, offline: false }
  }

  await enqueueServiceRequestUpdate(serviceRequestId, patchWithIntake)
  return {
    ok: true,
    offline: true,
    enrollment: { id: serviceRequestId, status: 'Ready', updated_at: now, intake_data: intakeData },
  }
}
