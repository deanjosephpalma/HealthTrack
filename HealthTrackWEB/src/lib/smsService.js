import { supabase } from './supabaseClient'
import { apiFetch } from './apiClient'

// ---------------------------------------------------------------------------
// Citizen's Charter processing time map (in minutes) per service type name
// ---------------------------------------------------------------------------
const CHARTER_WAIT_TIMES = {
  'animal bite': 9,
  'outpatient consultation': 22,
  'exhumation': 25,
  'cremation': 25,
  'transfer permit': 25,
  'review of death certificate': 20,
  'health card': 10,
  'health card issuance': 10,
  'medical certificate': 7,
  'medical certificate issuance': 7,
  'sanitary permit': 25,
  'sanitary permit issuance': 25,
  'tuberculosis': 16,
  'tuberculosis treatment': 16,
  'pre-marriage counseling': 240,
  'pre-marriage': 240,
}

export function computeEstimatedWait(queueAheadCount, serviceTypeName) {
  const name = (serviceTypeName ?? '').toString().toLowerCase()
  let perPatient = 15
  for (const [key, mins] of Object.entries(CHARTER_WAIT_TIMES)) {
    if (name.includes(key)) { perPatient = mins; break }
  }
  return Math.max(1, queueAheadCount) * perPatient
}

export function normalizePhilPhone(phone) {
  const raw = (phone ?? '').toString().trim()
  if (!raw) return null
  if (raw.startsWith('09') && raw.length === 11) return '+639' + raw.slice(2)
  if (/^\+639\d{9}$/.test(raw)) return raw
  return null
}

function subjectFromMessage(message) {
  const m = (message ?? '').toLowerCase()
  if (m.includes('queue number') || m.includes('in line') || m.includes('now serving'))
    return 'HealthTrack RHU — Queue Update'
  if (m.includes('booked') || m.includes('appointment has been'))
    return 'HealthTrack RHU — Appointment Confirmation'
  if (m.includes('accepted')) return 'HealthTrack RHU — Appointment Accepted'
  if (m.includes('ready for release') || m.includes('ready to be claimed'))
    return 'HealthTrack RHU — Document Ready'
  if (m.includes('reminder') || m.includes('follow-up') || m.includes('dose'))
    return 'HealthTrack RHU — Follow-up Reminder'
  if (m.includes('completed') || m.includes('thank you'))
    return 'HealthTrack RHU — Service Completed'
  if (m.includes('skipped')) return 'HealthTrack RHU — Queue Update'
  return 'HealthTrack RHU — Notification'
}

async function logNotification({ appointmentId, queueId, patientId, to, message, status, providerResponse }) {
  try {
    await supabase.from('email_logs').insert([{
      appointment_id: appointmentId ?? null,
      queue_id: queueId ?? null,
      patient_id: patientId ?? null,
      recipient_email: to,
      message,
      status,
      provider_response: providerResponse ? String(providerResponse).slice(0, 2000) : null,
    }])
  } catch (err) {
    console.warn('[Email] Failed to write to email_logs:', err?.message)
  }
}

async function resolvePhoneRecipient(to, patientId) {
  const direct = normalizePhilPhone(to)
  if (direct) return direct
  const raw = (to ?? '').toString().trim()
  if (!raw || !raw.includes('@')) return null

  if (patientId) {
    const { data } = await supabase
      .from('patients')
      .select('phone,mobile_phone')
      .eq('id', patientId)
      .maybeSingle()
    const byPatient = normalizePhilPhone(data?.mobile_phone || data?.phone || '')
    if (byPatient) return byPatient
  }

  const { data: contact } = await supabase
    .from('patient_contacts')
    .select('phone')
    .ilike('email', raw)
    .limit(1)
    .maybeSingle()
  return normalizePhilPhone(contact?.phone || '')
}

export async function sendSms({ to, message, subject, appointmentId, queueId, patientId }) {
  const phone = await resolvePhoneRecipient(to, patientId)

  if (!phone) {
    const reason = `No valid phone number: "${to}"`
    console.warn('[SMS]', reason)
    await logNotification({ appointmentId, queueId, patientId, to: to ?? '', message, status: 'failed', providerResponse: reason })
    return { ok: false, error: reason }
  }

  const smsText = message
  const smsSubject = subject || subjectFromMessage(message)

  try {
    await apiFetch('/notify/sms', {
      method: 'POST',
      body: {
        to: phone.startsWith('+63') ? `0${phone.slice(3)}` : phone,
        text: smsText,
        logData: { appointmentId, queueId, patientId, to: phone, subject: smsSubject, message: smsText },
      },
    })
    await logNotification({ appointmentId, queueId, patientId, to: phone, message: smsText, status: 'sent', providerResponse: 'sms' })
    return { ok: true }
  } catch (err) {
    const errMsg = err?.message ?? 'Unknown error'
    await logNotification({ appointmentId, queueId, patientId, to: phone, message: smsText, status: 'failed', providerResponse: errMsg })
    return { ok: false, error: errMsg }
  }
}

export function msgAddedToQueue({ patientName, queueNumber, estimatedWait }) {
  return `Hello ${patientName},\n\nYou have been added to the queue.\nYour queue number: ${queueNumber}\nEstimated waiting time: ${estimatedWait} minutes.\n\nPlease stay nearby and wait for your number to be called.\n\n— Rural Health Unit of Pila`
}

export function msgMarkedNext({ patientName, room }) {
  return `Hello ${patientName},\n\nYou are NEXT in line. Please proceed near ${room} and wait to be called.\n\n— Rural Health Unit of Pila`
}

export function msgCalled({ queueNumber, room }) {
  return `NOW SERVING: ${queueNumber}\n\nPlease proceed immediately to ${room}.\n\n— Rural Health Unit of Pila`
}

export function msgSkipped({ patientName, queueNumber }) {
  return `Hello ${patientName},\n\nYour queue number ${queueNumber} was skipped. Please approach the clinic staff at the counter to be re-queued.\n\n— Rural Health Unit of Pila`
}

export function msgCompleted({ patientName }) {
  return `Hello ${patientName},\n\nYour visit/transaction has been completed. Thank you for visiting the Rural Health Unit of Pila.\n\nStay healthy!\n\n— Rural Health Unit of Pila`
}

export function msgDocumentReady({ patientName, documentType }) {
  return `Hello ${patientName},\n\nYour ${documentType} is ready for release. Please visit the Rural Health Unit of Pila during office hours to claim it.\n\nOffice hours: Monday–Friday, 8:00 AM – 5:00 PM\n\n— Rural Health Unit of Pila`
}

export function msgFollowUpReminder({ type, date, dose }) {
  return `REMINDER — Rural Health Unit of Pila\n\nYour ${type} follow-up appointment (${dose}) is scheduled on ${date}.\n\nPlease visit the RHU on time. For inquiries, please call the RHU.\n\n— Rural Health Unit of Pila`
}

export function msgVaccineSchedule({ patientName, doseNumber, date }) {
  return `Hello ${patientName},\n\nYour Anti-Rabies Vaccine — Dose ${doseNumber} is scheduled on ${date}.\n\nPlease arrive at the Rural Health Unit of Pila on time.\n\n— Rural Health Unit of Pila`
}

export function msgWorkflowStepDone({ patientName, stepName }) {
  return `Hello ${patientName},\n\nYour RHU service request has been updated.\n\nStep completed: ${stepName}\n\nPlease wait for the next step. Staff will notify you shortly.\n\n— Rural Health Unit of Pila`
}
