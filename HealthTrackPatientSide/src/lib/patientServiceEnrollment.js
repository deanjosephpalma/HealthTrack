import { supabase } from './supabaseClient'
import { isOnline } from './offline/connectivity'
import { saveFormResponseLocal, enqueueServiceRequestUpdate } from './offline/paperlessService'
import { syncPatientQueue } from './offline/syncEngine'
import { resolvePatientPriority } from './patientPriority'

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
  intake_data,
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

  // Prefer active visit states for the portal (include staff encode pipeline).
  const { data: preferred, error: preferredError } = await supabase
    .from('service_requests')
    .select(REQUEST_SELECT)
    .eq('patient_id', patient.id)
    .in('status', ['Draft', 'Ready', 'Awaiting Encoding', 'Encoded'])
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

export async function ensurePatientProfile(patientAuthId, meta = {}) {
  if (!patientAuthId) return null

  const { data: existing } = await supabase
    .from('patients')
    .select('id')
    .eq('patient_auth_id', patientAuthId)
    .maybeSingle()
  if (existing?.id) return existing

  const firstName = (meta.first_name ?? '').toString().trim()
  const lastName = (meta.last_name ?? '').toString().trim()
  const phone = (meta.phone ?? '').toString().trim()
  const email = (meta.email ?? '').toString().trim() || null
  const fullName = `${firstName} ${lastName}`.trim() || email || 'Patient'

  const payload = {
    patient_auth_id: patientAuthId,
    name: fullName,
    first_name: firstName || null,
    last_name: lastName || null,
    email,
    phone: phone || null,
    mobile_phone: phone || null,
  }

  const { data: inserted, error: insertError } = await supabase
    .from('patients')
    .insert(payload)
    .select('id')
    .maybeSingle()

  if (!insertError && inserted?.id) return inserted

  // Race / unique: fetch again
  const { data: again } = await supabase
    .from('patients')
    .select('id')
    .eq('patient_auth_id', patientAuthId)
    .maybeSingle()
  if (again?.id) return again

  if (insertError) {
    console.warn('[ensurePatientProfile] insert failed:', insertError.message, insertError.code)
  }
  return null
}

export async function enrollPatientInService(patientAuthId, serviceId, userMeta = {}) {
  if (!patientAuthId || !serviceId) {
    console.warn('[enrollPatientInService] missing patientAuthId or serviceId', { patientAuthId, serviceId })
    return { ok: false, error: 'Service selection is required.' }
  }

  let patient = await ensurePatientProfile(patientAuthId, userMeta)
  console.log('[enrollPatientInService] patient lookup:', { patient, patientAuthId })

  if (!patient) {
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
      ok: false,
      error:
        'Your patient profile could not be created yet. Open Profile, save your name, then try selecting a service again.',
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

  // Reuse existing Draft/Ready/Awaiting Encoding/Encoded for the same service
  const { data: existingSame } = await supabase
    .from('service_requests')
    .select(REQUEST_SELECT)
    .eq('patient_id', patient.id)
    .eq('service_type_id', serviceId)
    .in('status', ['Draft', 'Ready', 'Awaiting Encoding', 'Encoded'])
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
  const { error: cancelError } = await supabase
    .from('service_requests')
    .update({ status: 'Cancelled', updated_at: new Date().toISOString() })
    .eq('patient_id', patient.id)
    .in('status', ['Draft', 'Ready', 'Awaiting Encoding', 'Encoded'])
  if (cancelError) {
    console.warn('[enrollPatientInService] cancel previous enrollments:', cancelError.message)
  }

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

  if (error) {
    const msg = error.message || 'Could not create service enrollment.'
    if (/row-level security|rls|permission denied|42501/i.test(msg)) {
      return {
        ok: false,
        error:
          'Unable to select service (permission blocked). Ask RHU staff to apply service_requests_patient_enroll_rls.sql in Supabase.',
      }
    }
    return { ok: false, error: msg }
  }

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

/**
 * Patient joins the RHU BHW/Volunteer encode line (no queue number yet).
 * Staff encodes first, then issues a queue number to Doctor / service desk.
 * Senior (60+) and PWD are flagged as priority in intake_data from Get in line.
 */
export async function joinStaffLine({ serviceRequestId, reason = null } = {}) {
  if (!serviceRequestId) {
    return { ok: false, error: 'Select a service first.' }
  }

  const now = new Date().toISOString()

  const loadPriorityFlags = async (patientId) => {
    if (!patientId) return resolvePatientPriority({})
    const { data: patient } = await supabase
      .from('patients')
      .select('birthdate, disability')
      .eq('id', patientId)
      .maybeSingle()
    return resolvePatientPriority({
      birthdate: patient?.birthdate,
      disability: patient?.disability,
    })
  }

  if (!isOnline()) {
    const patch = {
      status: 'Awaiting Encoding',
      updated_at: now,
      intake_data: {
        ...(reason ? { join_reason: reason } : {}),
        line_joined_at: now,
      },
    }
    await enqueueServiceRequestUpdate(serviceRequestId, patch)
    return {
      ok: true,
      offline: true,
      enrollment: { id: serviceRequestId, status: 'Awaiting Encoding', updated_at: now },
      message: 'You are in line for BHW / Volunteer encoding (first-come, first-served). Sync when online.',
    }
  }

  const { data: current } = await supabase
    .from('service_requests')
    .select('id, status, intake_data, patient_id')
    .eq('id', serviceRequestId)
    .maybeSingle()

  if (!current) {
    return { ok: false, error: 'Service enrollment not found.' }
  }

  if (['Awaiting Encoding', 'Encoded'].includes(current.status)) {
    return {
      ok: true,
      alreadyInLine: true,
      enrollment: current,
      message:
        current.status === 'Encoded'
          ? 'Your visit is already encoded. Please wait for your queue number.'
          : 'You are already in line for BHW / Volunteer encoding.',
    }
  }

  if (current.status === 'In Queue') {
    return {
      ok: true,
      alreadyInLine: true,
      enrollment: current,
      message: 'You already have a queue number. Check your ticket below.',
    }
  }

  const priority = await loadPriorityFlags(current.patient_id)
  const nextIntake = {
    ...(current.intake_data && typeof current.intake_data === 'object' ? current.intake_data : {}),
    ...(reason ? { join_reason: reason } : {}),
    is_senior: priority.isSenior,
    is_pwd: priority.isPwd,
    is_priority: priority.isPriority,
    priority_labels: priority.labels,
    // FCFS: when the patient actually joined the encode line (not when Draft was created)
    line_joined_at: now,
  }

  let { data, error } = await supabase
    .from('service_requests')
    .update({
      status: 'Awaiting Encoding',
      intake_data: nextIntake,
      updated_at: now,
    })
    .eq('id', serviceRequestId)
    .select(REQUEST_SELECT)
    .single()

  if (error && /intake_data/i.test(error.message || '')) {
    ;({ data, error } = await supabase
      .from('service_requests')
      .update({ status: 'Awaiting Encoding', updated_at: now })
      .eq('id', serviceRequestId)
      .select(REQUEST_SELECT)
      .single())
  }

  if (error) {
    return { ok: false, error: error.message || 'Could not join the encode line.' }
  }

  return {
    ok: true,
    enrollment: data,
    priority,
    message: priority.isPriority
      ? `You are in the priority line (${priority.label}). First-come, first-served among priority patients.`
      : 'You are now in line (first-come, first-served). Please wait for a BHW or Volunteer to encode your visit.',
  }
}

/**
 * Patient leaves the BHW/Volunteer encode line before encoding starts.
 * Allowed only while status is still "Awaiting Encoding".
 */
export async function cancelEncodeLine({ serviceRequestId, patientAuthId } = {}) {
  if (!serviceRequestId) {
    return { ok: false, error: 'No active encode line to cancel.' }
  }

  const now = new Date().toISOString()
  const patch = { status: 'Cancelled', updated_at: now }

  if (!isOnline()) {
    await enqueueServiceRequestUpdate(serviceRequestId, patch)
    return {
      ok: true,
      offline: true,
      message: 'Your encode line was cancelled. It will sync when you are online.',
    }
  }

  const { data: current, error: loadError } = await supabase
    .from('service_requests')
    .select('id, status, patient_auth_id')
    .eq('id', serviceRequestId)
    .maybeSingle()

  if (loadError) {
    return { ok: false, error: loadError.message || 'Could not load your visit.' }
  }
  if (!current) {
    return { ok: false, error: 'Service enrollment not found.' }
  }
  if (patientAuthId && current.patient_auth_id && current.patient_auth_id !== patientAuthId) {
    return { ok: false, error: 'You can only cancel your own encode line.' }
  }
  if (current.status !== 'Awaiting Encoding') {
    if (current.status === 'Encoded') {
      return {
        ok: false,
        error: 'Encoding already finished. You can no longer cancel — please wait for your queue number.',
      }
    }
    if (['In Queue', 'In Progress', 'For Doctor', 'Completed'].includes(current.status)) {
      return { ok: false, error: 'This visit is already in progress and cannot be cancelled from here.' }
    }
    if (current.status === 'Cancelled') {
      return { ok: true, alreadyCancelled: true, message: 'This encode line was already cancelled.' }
    }
    return {
      ok: false,
      error: `Cannot cancel while status is "${current.status}". You may only cancel during encoding wait.`,
    }
  }

  let query = supabase.from('service_requests').update(patch).eq('id', serviceRequestId).eq('status', 'Awaiting Encoding')
  if (patientAuthId) {
    query = query.eq('patient_auth_id', patientAuthId)
  }

  const { data, error } = await query.select('id, status, updated_at').maybeSingle()

  if (error) {
    return { ok: false, error: error.message || 'Could not cancel the encode line.' }
  }
  if (!data) {
    return {
      ok: false,
      error: 'Could not cancel — encoding may have already started. Refresh and try again.',
    }
  }

  return {
    ok: true,
    enrollment: data,
    message: 'You left the encode line. You can select a service and get in line again anytime.',
  }
}
