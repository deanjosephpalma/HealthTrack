import { supabase } from './supabaseClient'
import { sendSms, msgFollowUpReminder } from './smsService'

// ---------------------------------------------------------------------------
// Reference Number Generator (RHU-YYYY-NNNNNN)
// ---------------------------------------------------------------------------
export async function generateReferenceNumber() {
  const year = new Date().getFullYear()
  const prefix = `RHU-${year}-`

  const { count } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .like('reference_number', `${prefix}%`)

  const seq = (count ?? 0) + 1
  return `${prefix}${String(seq).padStart(6, '0')}`
}

// ---------------------------------------------------------------------------
// Queue Number Generator (PREFIX-NNN)
// ---------------------------------------------------------------------------
export async function generateQueueNumber(serviceCode) {
  const prefix = serviceCode || 'RHU'

  // Prefer atomic allocator (phase3_performance.sql). Fall back to max+1 if RPC missing.
  const { data: rpcNumber, error: rpcError } = await supabase.rpc('next_queue_number', {
    p_service_code: prefix,
  })

  if (!rpcError && rpcNumber != null) {
    const next = Number(rpcNumber)
    if (Number.isFinite(next) && next > 0) {
      return {
        raw: next,
        label: `${prefix}-${String(next).padStart(3, '0')}`,
      }
    }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const { data } = await supabase
    .from('queue')
    .select('queue_number')
    .eq('service_code', prefix)
    .gte('created_at', today.toISOString())
    .lt('created_at', tomorrow.toISOString())
    .order('queue_number', { ascending: false })
    .limit(1)

  const last = Number(Array.isArray(data) ? data[0]?.queue_number : 0)
  const next = (Number.isFinite(last) && last > 0 ? last : 0) + 1
  return {
    raw: next,
    label: `${prefix}-${String(next).padStart(3, '0')}`,
  }
}

// ---------------------------------------------------------------------------
// Ensure Service Request Exists
// ---------------------------------------------------------------------------
export async function ensureServiceRequest({
  patientId,
  appointmentId = null,
  queueId = null,
  serviceId = null,
  assignedStaffId,
}) {
  if (queueId) {
    const { data: byQueue } = await supabase
      .from('service_requests')
      .select('id')
      .eq('queue_id', queueId)
      .maybeSingle()

    if (byQueue) {
      await supabase
        .from('service_requests')
        .update({
          assigned_doctor_id: assignedStaffId,
          status: 'In Queue',
          updated_at: new Date().toISOString(),
        })
        .eq('id', byQueue.id)
      return { data: byQueue, error: null }
    }
  }

  if (appointmentId) {
    const { data: existing } = await supabase
      .from('service_requests')
      .select('id')
      .eq('appointment_id', appointmentId)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('service_requests')
        .update({
          assigned_doctor_id: assignedStaffId,
          queue_id: queueId ?? undefined,
          status: 'In Queue',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      return { data: existing, error: null }
    }
  }

  let resolvedServiceId = serviceId
  if (!resolvedServiceId) {
    const { data: opd } = await supabase
      .from('services')
      .select('id')
      .eq('name', 'Outpatient Consultation')
      .maybeSingle()
    resolvedServiceId = opd?.id ?? null
  }

  if (!resolvedServiceId) {
    const { data: anyService } = await supabase.from('services').select('id').limit(1).maybeSingle()
    resolvedServiceId = anyService?.id ?? null
  }

  if (!resolvedServiceId) {
    return { data: null, error: new Error('Default service missing.') }
  }

  const { data: request, error: reqError } = await supabase
    .from('service_requests')
    .insert([
      {
        patient_id: patientId,
        service_id: resolvedServiceId,
        appointment_id: appointmentId,
        queue_id: queueId,
        status: 'In Queue',
        assigned_doctor_id: assignedStaffId,
      },
    ])
    .select('id')
    .single()

  return { data: request, error: reqError }
}

// ---------------------------------------------------------------------------
// Follow-up SMS sender (kept for backward compatibility if needed)
// ---------------------------------------------------------------------------
export async function sendAnimalBiteReminders() {
  const today = new Date().toISOString().slice(0, 10)
  const { data: records } = await supabase
    .from('animal_bite_doses')
    .select('id, patient_email, next_due_dose, next_due_date')
    .eq('status', 'active')
    .eq('next_due_date', today)

  if (!Array.isArray(records)) return

  for (const rec of records) {
    if (!rec.patient_email) continue
    await sendSms({
      to: rec.patient_email,
      message: msgFollowUpReminder({
        type: 'Animal Bite Vaccine',
        date: rec.next_due_date,
        dose: `Dose ${rec.next_due_dose}`,
      }),
    })
  }
}

export async function sendTBReminders() {
  const today = new Date().toISOString().slice(0, 10)
  const { data: records } = await supabase
    .from('tb_monitoring')
    .select('id, patient_email, schedule')
    .eq('status', 'active')

  if (!Array.isArray(records)) return

  for (const rec of records) {
    if (!rec.patient_email) continue
    const todaySlot = (rec.schedule ?? []).find((s) => s.date === today && s.status === 'pending')
    if (!todaySlot) continue

    await sendSms({
      to: rec.patient_email,
      message: msgFollowUpReminder({
        type: 'TB Treatment',
        date: today,
        dose: `Week ${todaySlot.week}`,
      }),
    })
  }
}

// ---------------------------------------------------------------------------
// Legacy Workflow Functions (kept for FollowUpsPage/WorkflowPage compatibility)
// ---------------------------------------------------------------------------
export async function advanceStep() {
  return { error: new Error('advanceStep is deprecated. Use ServiceWorkflowPage.') }
}

export async function completeWorkflow() {
  return { error: new Error('completeWorkflow is deprecated. Use ServiceWorkflowPage.') }
}

export async function markAnimalBiteDose({ doseRecordId, doseNumber, staffId }) {
  const n = Number(doseNumber)
  if (!doseRecordId || !Number.isFinite(n) || n < 1 || n > 5) {
    return { error: new Error('Invalid dose record or dose number.') }
  }

  const { data: row, error: loadError } = await supabase
    .from('animal_bite_doses')
    .select('*')
    .eq('id', doseRecordId)
    .maybeSingle()

  if (loadError) return { error: loadError }
  if (!row) return { error: new Error('Dose schedule not found.') }

  const nowIso = new Date().toISOString()
  const patch = {
    [`dose_${n}_done`]: true,
    [`dose_${n}_given_at`]: nowIso,
    updated_at: nowIso,
  }

  let nextDueDose = null
  let nextDueDate = null
  for (let i = n + 1; i <= 5; i += 1) {
    if (!row[`dose_${i}_done`]) {
      nextDueDose = i
      nextDueDate = row[`dose_${i}_date`] ?? null
      break
    }
  }

  if (nextDueDose) {
    patch.next_due_dose = nextDueDose
    patch.next_due_date = nextDueDate
  } else {
    patch.next_due_dose = null
    patch.next_due_date = null
    patch.status = 'completed'
  }

  const { error } = await supabase.from('animal_bite_doses').update(patch).eq('id', doseRecordId)
  return { error, staffId }
}

function addDaysIso(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** Standard anti-rabies schedule: Day 0, 3, 7, 14, 28 from bite/start date. */
export function buildAnimalBiteDoseDates(startDate) {
  const base = (startDate || new Date().toISOString().slice(0, 10)).toString().slice(0, 10)
  return {
    bite_date: base,
    dose_1_date: base,
    dose_2_date: addDaysIso(base, 3),
    dose_3_date: addDaysIso(base, 7),
    dose_4_date: addDaysIso(base, 14),
    dose_5_date: addDaysIso(base, 28),
  }
}

export function buildTbWeeklySchedule(startDate, weeks = 24) {
  const base = (startDate || new Date().toISOString().slice(0, 10)).toString().slice(0, 10)
  const duration = Math.max(1, Number(weeks) || 24)
  const schedule = []
  for (let week = 1; week <= duration; week += 1) {
    schedule.push({
      week,
      date: addDaysIso(base, (week - 1) * 7),
      status: week === 1 ? 'attended' : 'pending',
      notes: '',
    })
  }
  return schedule
}

export async function createAnimalBiteSchedule({
  patientId,
  patientAuthId,
  serviceRequestId,
  phoneNumber,
  patientEmail,
  startDate,
  markDose1Done = true,
  notes = null,
}) {
  const dates = buildAnimalBiteDoseDates(startDate)
  const nowIso = new Date().toISOString()
  const payload = {
    ...dates,
    patient_id: patientId ?? null,
    patient_auth_id: patientAuthId ?? null,
    service_request_id: serviceRequestId ?? null,
    phone_number: phoneNumber ?? null,
    patient_email: patientEmail ?? null,
    dose_1_done: Boolean(markDose1Done),
    dose_1_given_at: markDose1Done ? nowIso : null,
    next_due_dose: markDose1Done ? 2 : 1,
    next_due_date: markDose1Done ? dates.dose_2_date : dates.dose_1_date,
    status: 'active',
    notes: notes ?? null,
  }

  // Avoid duplicate active schedules for same patient/request
  if (serviceRequestId) {
    const { data: existing } = await supabase
      .from('animal_bite_doses')
      .select('id')
      .eq('service_request_id', serviceRequestId)
      .eq('status', 'active')
      .maybeSingle()
    if (existing) {
      const { data, error } = await supabase
        .from('animal_bite_doses')
        .update({ ...payload, updated_at: nowIso })
        .eq('id', existing.id)
        .select('*')
        .single()
      return { data, error }
    }
  }

  const { data, error } = await supabase.from('animal_bite_doses').insert([payload]).select('*').single()
  return { data, error }
}

export async function createTbMonitoringSchedule({
  patientId,
  patientAuthId,
  serviceRequestId,
  phoneNumber,
  patientEmail,
  startDate,
  treatmentDurationWeeks = 24,
  notes = null,
}) {
  const start = (startDate || new Date().toISOString().slice(0, 10)).toString().slice(0, 10)
  const weeks = Math.max(1, Number(treatmentDurationWeeks) || 24)
  const schedule = buildTbWeeklySchedule(start, weeks)
  const nowIso = new Date().toISOString()
  const payload = {
    patient_id: patientId ?? null,
    patient_auth_id: patientAuthId ?? null,
    service_request_id: serviceRequestId ?? null,
    phone_number: phoneNumber ?? null,
    patient_email: patientEmail ?? null,
    start_date: start,
    schedule,
    treatment_duration_weeks: weeks,
    last_visit_date: start,
    status: 'active',
    notes: notes ?? null,
  }

  if (serviceRequestId) {
    const { data: existing } = await supabase
      .from('tb_monitoring')
      .select('id')
      .eq('service_request_id', serviceRequestId)
      .eq('status', 'active')
      .maybeSingle()
    if (existing) {
      const { data, error } = await supabase
        .from('tb_monitoring')
        .update({ ...payload, updated_at: nowIso })
        .eq('id', existing.id)
        .select('*')
        .single()
      return { data, error }
    }
  }

  const { data, error } = await supabase.from('tb_monitoring').insert([payload]).select('*').single()
  return { data, error }
}
