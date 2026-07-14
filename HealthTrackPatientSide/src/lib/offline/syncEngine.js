import { supabase } from '../supabaseClient'
import { patientOfflineDb } from './db'
import { isOnline } from './connectivity'
import {
  mergeRemoteTickets,
  reconcileLocalActiveTickets,
  countPendingOutbox,
  buildInsertPayload,
  linkServiceRequest,
} from './joinQueue'

let syncing = false
const syncListeners = new Set()

export function subscribePatientSync(fn) {
  syncListeners.add(fn)
  return () => syncListeners.delete(fn)
}

function emitPatientSync(result) {
  for (const fn of syncListeners) {
    try {
      fn(result)
    } catch {
      /* ignore */
    }
  }
}

async function pushCreate(job) {
  const { row } = job.payload
  const { error } = await supabase.from('queue').upsert([buildInsertPayload(row)], { onConflict: 'id' })
  if (error) throw new Error(error.message)

  await patientOfflineDb.queue.update(row.id, { synced: 1, pending_create: 0 })
  try {
    await linkServiceRequest(row)
  } catch {
    /* non-fatal */
  }
}

async function pushFormResponse(job) {
  const { row } = job.payload
  const { synced, ...payload } = row
  const { error } = await supabase.from('form_responses').upsert([payload], {
    onConflict: 'service_request_id,workflow_step_id',
  })
  if (error) throw new Error(error.message)
  await patientOfflineDb.formResponses.put({ ...row, synced: 1 })
}

async function pushServiceRequestUpdate(job) {
  const { id, patch } = job.payload
  const { error } = await supabase.from('service_requests').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

async function pushDocumentUpload(job) {
  const { id } = job.payload
  const doc = await patientOfflineDb.documents.get(id)
  if (!doc?.blob) throw new Error('Document blob missing.')

  const patientKey = doc.patient_auth_id || 'unknown'
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
      },
    ],
    { onConflict: 'id' },
  )
  if (insertError && doc.service_request_id) throw new Error(insertError.message)

  await patientOfflineDb.documents.update(id, {
    synced: 1,
    file_path: path,
    file_url: pub?.publicUrl ?? null,
    blob: undefined,
  })
}

async function pushOutbox() {
  const jobs = await patientOfflineDb.outbox.filter((r) => !r.synced).sortBy('id')
  // Prefer queue tickets so one failed form/doc job cannot block joining the line
  const ordered = [
    ...jobs.filter((j) => j.type === 'queue_create'),
    ...jobs.filter((j) => j.type !== 'queue_create'),
  ]
  let firstError = null
  for (const job of ordered) {
    try {
      if (job.type === 'queue_create') await pushCreate(job)
      else if (job.type === 'form_response_upsert') await pushFormResponse(job)
      else if (job.type === 'service_request_update') await pushServiceRequestUpdate(job)
      else if (job.type === 'document_upload') await pushDocumentUpload(job)
      else {
        // Unknown job type — drop so it cannot block forever
        await patientOfflineDb.outbox.update(job.id, { synced: 1, last_error: 'skipped_unknown_type' })
        continue
      }
      await patientOfflineDb.outbox.update(job.id, { synced: 1 })
    } catch (err) {
      const attempts = (job.attempts || 0) + 1
      await patientOfflineDb.outbox.update(job.id, {
        attempts,
        last_error: err?.message || String(err),
        // After several failures, release the block so newer tickets can sync
        ...(attempts >= 5 ? { synced: 1 } : {}),
      })
      if (!firstError) firstError = err
    }
  }
  if (firstError) throw firstError
}

async function pullMyTickets({ patientId, patientAuthId }) {
  if (!patientId && !patientAuthId) return []

  const selectCols =
    'id, queue_number, patient_id, patient_name, reason, status, created_at, updated_at, phone_number, counter_room, estimated_waiting_time, service_code, archived_at'

  let rows = []
  if (patientId) {
    const { data, error } = await supabase
      .from('queue')
      .select(selectCols)
      .eq('patient_id', patientId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) throw new Error(error.message)
    rows = data ?? []
  }

  // Fallback / merge: also find by name+recent if patient_id was null on older inserts
  if (patientAuthId && rows.length === 0) {
    const { data: patientRow } = await supabase
      .from('patients')
      .select('id, name')
      .eq('patient_auth_id', patientAuthId)
      .maybeSingle()
    if (patientRow?.id && patientRow.id !== patientId) {
      const { data, error } = await supabase
        .from('queue')
        .select(selectCols)
        .eq('patient_id', patientRow.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(30)
      if (!error) rows = data ?? []
    }
  }

  await mergeRemoteTickets(rows, { patientId, patientAuthId })

  // Always reconcile locally-active tickets by id (status may have become completed)
  try {
    const reconciled = await reconcileLocalActiveTickets({ patientId, patientAuthId })
    const byId = new Map(rows.map((r) => [r.id, r]))
    for (const r of reconciled) byId.set(r.id, r)
    rows = Array.from(byId.values())
  } catch {
    /* non-fatal — patient_id pull already ran */
  }

  return rows
}

async function pullFollowUps(patientAuthId) {
  if (!patientAuthId) return
  const [abRes, tbRes] = await Promise.all([
    supabase
      .from('animal_bite_doses')
      .select('*')
      .eq('patient_auth_id', patientAuthId)
      .order('created_at', { ascending: false }),
    supabase
      .from('tb_monitoring')
      .select('*')
      .eq('patient_auth_id', patientAuthId)
      .order('created_at', { ascending: false }),
  ])
  const { cacheFollowUpSchedules } = await import('./paperlessService')
  await cacheFollowUpSchedules({
    animalBite: abRes.data ?? [],
    tb: tbRes.data ?? [],
  })
}

export async function syncPatientQueue({ patientId, patientAuthId } = {}) {
  if (!isOnline() || syncing) {
    const skipped = { ok: false, reason: syncing ? 'busy' : 'offline' }
    emitPatientSync(skipped)
    return skipped
  }
  syncing = true
  try {
    let pushError = null
    try {
      await pushOutbox()
    } catch (err) {
      pushError = err
    }
    const rows = await pullMyTickets({ patientId, patientAuthId })
    if (patientAuthId) {
      try {
        await pullFollowUps(patientAuthId)
      } catch {
        /* non-fatal */
      }
    }
    const pending = await countPendingOutbox()
    const result =
      pushError && pending > 0
        ? { ok: false, error: pushError?.message || String(pushError), rows, pending }
        : { ok: true, rows, pending }
    emitPatientSync(result)
    return result
  } catch (err) {
    const result = { ok: false, error: err?.message || String(err) }
    emitPatientSync(result)
    return result
  } finally {
    syncing = false
  }
}

export function startPatientAutoSync({ patientId, patientAuthId, intervalMs = 20000, onAfterSync } = {}) {
  const run = async () => {
    const result = await syncPatientQueue({ patientId, patientAuthId })
    if (typeof onAfterSync === 'function') {
      try {
        await onAfterSync(result)
      } catch {
        /* ignore */
      }
    }
  }
  window.addEventListener('online', run)
  const id = window.setInterval(run, intervalMs)
  void run()
  return () => {
    window.removeEventListener('online', run)
    window.clearInterval(id)
  }
}
