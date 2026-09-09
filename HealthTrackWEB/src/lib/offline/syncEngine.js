import { supabase } from '../supabaseClient'
import { ensureServiceRequest } from '../workflowEngine'
import {
  msgMarkedNext,
  msgCalled,
  msgSkipped,
  msgCompleted,
  sendSms,
} from '../smsService'
import { staffOfflineDb, getMeta, setMeta } from './db'
import { isOnline } from './connectivity'
import { mergeRemoteQueueRows, countPendingOutbox } from './queueService'

let syncing = false
let listeners = new Set()

export function subscribeSyncStatus(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emitSync(status) {
  for (const fn of listeners) {
    try {
      fn(status)
    } catch {
      /* ignore */
    }
  }
}

async function pushCreate(job) {
  const { row, assignedStaffId, serviceRequestId } = job.payload
  const insertPayload = {
    id: row.id,
    queue_number: row.queue_number,
    patient_name: row.patient_name,
    reason: row.reason,
    status: row.status || 'waiting',
    appointment_id: row.appointment_id ?? null,
    patient_id: row.patient_id ?? null,
    phone_number: row.phone_number ?? null,
    service_code: row.service_code ?? 'RHU',
    counter_room: row.counter_room ?? 'Counter 1',
    estimated_waiting_time: row.estimated_waiting_time ?? null,
    is_priority: Boolean(row.is_priority),
    priority_labels: row.priority_labels ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  }

  let { error } = await supabase.from('queue').upsert([insertPayload], { onConflict: 'id' })
  if (error && /is_priority|priority_labels/i.test(error.message || '')) {
    const { is_priority, priority_labels, ...legacy } = insertPayload
    ;({ error } = await supabase.from('queue').upsert([legacy], { onConflict: 'id' }))
  }
  if (error) throw new Error(error.message)

  await staffOfflineDb.queue.update(row.id, { synced: 1, pending_create: 0 })

  const linkedRequestId = serviceRequestId || row.service_request_id || null
  if (linkedRequestId) {
    const { error: linkError } = await supabase
      .from('service_requests')
      .update({
        queue_id: row.id,
        status: 'In Queue',
        current_status: 'waiting',
        updated_at: new Date().toISOString(),
      })
      .eq('id', linkedRequestId)
    if (linkError) throw new Error(linkError.message)
  } else if (assignedStaffId || row.patient_id) {
    try {
      await ensureServiceRequest({
        patientId: row.patient_id ?? null,
        appointmentId: null,
        queueId: row.id,
        serviceId: row.service_id ?? null,
        assignedStaffId: assignedStaffId ?? null,
      })
    } catch {
      /* non-fatal */
    }
  }
}

async function pushUpdate(job) {
  const { id, patch, notify } = job.payload
  const { error } = await supabase.from('queue').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  await staffOfflineDb.queue.update(id, { synced: 1 })

  if (!notify || !isOnline()) return
  const status = patch.status
  if (!status) return

  const prefix = notify.service_code ?? 'RHU'
  const room = notify.counter_room || 'the clinic'
  const queueLabel = notify.queue_number
    ? `${prefix}-${String(notify.queue_number).padStart(3, '0')}`
    : String(notify.queue_number ?? '')

  let message = null
  if (status === 'next') message = msgMarkedNext({ patientName: notify.patient_name, room })
  else if (status === 'called') message = msgCalled({ queueNumber: queueLabel, room })
  else if (status === 'skipped')
    message = msgSkipped({ patientName: notify.patient_name, queueNumber: queueLabel })
  else if (status === 'completed' || status === 'done')
    message = msgCompleted({ patientName: notify.patient_name })

  const to = notify.phone_number || notify.patient_email
  if (message && to) {
    await sendSms({
      to,
      message,
      queueId: id,
      appointmentId: notify.appointment_id ?? null,
      patientId: notify.patient_id ?? null,
    })
  }
}

async function pushPatientRecord(job) {
  const { row } = job.payload
  const { synced, pending_create, ...payload } = row
  const { error } = await supabase.from('patient_records').upsert([payload], { onConflict: 'id' })
  if (error) throw new Error(error.message)
  await staffOfflineDb.patientRecords.update(row.id, { synced: 1 })
}

async function pushFormResponse(job) {
  const { row } = job.payload
  const { synced, ...payload } = row
  const { error } = await supabase.from('form_responses').upsert([payload], {
    onConflict: 'service_request_id,workflow_step_id',
  })
  if (error) throw new Error(error.message)
  await staffOfflineDb.formResponses.put({ ...row, synced: 1 })
}

async function pushFollowupSchedule(job) {
  const { kind, row } = job.payload
  const table = kind === 'tb' ? 'tb_monitoring' : kind === 'outpatient' ? 'appointments' : 'animal_bite_doses'
  const { synced, kind: _k, ...payload } = row
  const { error } = await supabase.from(table).upsert([payload], { onConflict: 'id' })
  if (error) throw new Error(error.message)
  await staffOfflineDb.schedules.update(row.id, { synced: 1 })
}

async function pushDocumentUpload(job) {
  const { id } = job.payload
  const doc = await staffOfflineDb.documents.get(id)
  if (!doc?.blob) throw new Error('Document blob missing.')

  const patientKey = doc.patient_id || doc.patient_auth_id || 'unknown'
  const safeName = String(doc.file_name || 'document').replace(/[^\w.\-]+/g, '_')
  const path = `rhu-requirements/${patientKey}/${doc.id}-${safeName}`

  const { error: upError } = await supabase.storage.from('rhu-requirements').upload(path, doc.blob, {
    contentType: doc.mime_type || 'application/octet-stream',
    upsert: true,
  })
  if (upError) throw new Error(upError.message)

  const { data: pub } = supabase.storage.from('rhu-requirements').getPublicUrl(path)
  const { error: insertError } = await supabase.from('requirements_submissions').upsert(
    [
      {
        id: doc.id,
        service_request_id: doc.service_request_id,
        patient_auth_id: doc.patient_auth_id,
        document_name: doc.document_name,
        file_path: path,
        file_url: pub?.publicUrl ?? null,
        uploaded_by: doc.uploaded_by ?? null,
      },
    ],
    { onConflict: 'id' },
  )
  // If table requires service_request_id NOT NULL and it's null, still keep blob synced flag after storage upload
  if (insertError && doc.service_request_id) throw new Error(insertError.message)

  await staffOfflineDb.documents.update(id, {
    synced: 1,
    file_path: path,
    file_url: pub?.publicUrl ?? null,
    blob: undefined,
  })
}

async function pushServiceRequestUpdate(job) {
  const { id, patch } = job.payload
  const { error } = await supabase.from('service_requests').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

async function pushOutbox() {
  const jobs = await staffOfflineDb.outbox.filter((r) => !r.synced).sortBy('id')
  let firstError = null
  for (const job of jobs) {
    try {
      if (job.type === 'queue_create') await pushCreate(job)
      else if (job.type === 'queue_update') await pushUpdate(job)
      else if (job.type === 'patient_record_upsert') await pushPatientRecord(job)
      else if (job.type === 'form_response_upsert') await pushFormResponse(job)
      else if (job.type === 'followup_schedule_upsert') await pushFollowupSchedule(job)
      else if (job.type === 'document_upload') await pushDocumentUpload(job)
      else if (job.type === 'service_request_update') await pushServiceRequestUpdate(job)
      else {
        await staffOfflineDb.outbox.update(job.id, { synced: 1, last_error: 'skipped_unknown_type' })
        continue
      }
      await staffOfflineDb.outbox.update(job.id, { synced: 1 })
    } catch (err) {
      const attempts = (job.attempts || 0) + 1
      // Never mark failed jobs as synced — keep in outbox as dead-letter (synced=0).
      await staffOfflineDb.outbox.update(job.id, {
        attempts,
        last_error: err?.message || String(err),
        ...(attempts >= 8 ? { dead_letter: 1 } : {}),
      })
      if (!firstError) firstError = err
    }
  }
  return firstError
}

async function pullTodayQueue() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const { data, error } = await supabase
    .from('queue')
    .select(
      'id, queue_number, patient_id, patient_name, reason, status, created_at, updated_at, appointment_id, phone_number, counter_room, estimated_waiting_time, service_code, is_priority, priority_labels, archived_at, patient:patients!queue_patient_id_fkey(patient_number), appointment:appointments!queue_appointment_id_fkey(patient_email)',
    )
    .is('archived_at', null)
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: true })

  if (error && /is_priority|priority_labels/i.test(error.message || '')) {
    const fallback = await supabase
      .from('queue')
      .select(
        'id, queue_number, patient_id, patient_name, reason, status, created_at, updated_at, appointment_id, phone_number, counter_room, estimated_waiting_time, service_code, archived_at, patient:patients!queue_patient_id_fkey(patient_number), appointment:appointments!queue_appointment_id_fkey(patient_email)',
      )
      .is('archived_at', null)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: true })
    if (fallback.error) throw new Error(fallback.error.message)
    await mergeRemoteQueueRows(fallback.data ?? [])
    return fallback.data ?? []
  }

  if (error) throw new Error(error.message)
  await mergeRemoteQueueRows(data ?? [])
  return data ?? []
}

export async function syncNow() {
  if (!isOnline() || syncing) {
    return { ok: false, reason: syncing ? 'busy' : 'offline' }
  }
  syncing = true
  emitSync({ syncing: true })
  try {
    const pushError = await pushOutbox()
    const rows = await pullTodayQueue()
    // Refresh patient directory at most every 5 minutes (offline search).
    try {
      const lastPull = await getMeta('patientsCachePulledAt', 0)
      const age = Date.now() - Number(lastPull || 0)
      if (!lastPull || age > 5 * 60 * 1000) {
        const { pullPatientsDirectory } = await import('./patientsCacheService')
        await pullPatientsDirectory({ pageSize: 500, maxPages: 4 })
        await setMeta('patientsCachePulledAt', Date.now())
      }
    } catch {
      // Non-fatal — queue sync still succeeded
    }
    const pending = await countPendingOutbox()
    emitSync({
      syncing: false,
      pending,
      lastSyncAt: new Date().toISOString(),
      ...(pushError ? { error: pushError.message || String(pushError) } : {}),
    })
    return {
      ok: !pushError,
      rows,
      pending,
      ...(pushError ? { error: pushError.message || String(pushError) } : {}),
    }
  } catch (err) {
    const pending = await countPendingOutbox()
    emitSync({ syncing: false, pending, error: err?.message || String(err) })
    return { ok: false, error: err?.message || String(err), pending }
  } finally {
    syncing = false
  }
}

export function startAutoSync({ intervalMs = 20000 } = {}) {
  const run = () => {
    void syncNow()
  }
  window.addEventListener('online', run)
  const id = window.setInterval(run, intervalMs)
  run()
  return () => {
    window.removeEventListener('online', run)
    window.clearInterval(id)
  }
}
