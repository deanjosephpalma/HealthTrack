import { generateQueueNumber } from '../workflowEngine'
import { supabase } from '../supabaseClient'
import { staffOfflineDb, getMeta, setMeta, getOrCreateDeviceId, todayKey } from './db'
import { isOnline } from './connectivity'
import { compareByPriorityThenArrival } from '../patientPriority'
import { shouldMergeQueueRow, queueAdvanceChanges } from '../queueState'

function newId() {
  return crypto.randomUUID()
}

async function nextOfflineQueueNumber(serviceCode) {
  const prefix = serviceCode || 'RHU'
  const key = `seq:${todayKey()}:${prefix}`
  const current = Number(await getMeta(key, 0)) || 0
  const localMax = await staffOfflineDb.queue
    .where('service_code')
    .equals(prefix)
    .toArray()
  const fromLocal = localMax.reduce((max, row) => {
    const n = Number(row.queue_number) || 0
    return n > max ? n : max
  }, 0)
  const next = Math.max(current, fromLocal) + 1
  await setMeta(key, next)
  const deviceId = await getOrCreateDeviceId()
  return {
    raw: next,
    label: `${prefix}-${String(next).padStart(3, '0')}`,
    deviceId,
  }
}

async function allocateQueueNumber(serviceCode) {
  if (isOnline()) {
    try {
      return await generateQueueNumber(serviceCode)
    } catch {
      return nextOfflineQueueNumber(serviceCode)
    }
  }
  return nextOfflineQueueNumber(serviceCode)
}

async function enqueueOutbox(type, payload) {
  await staffOfflineDb.outbox.add({
    type,
    payload,
    created_at: new Date().toISOString(),
    synced: 0,
    attempts: 0,
  })
}

export async function listLocalQueue() {
  const rows = await staffOfflineDb.queue
    .filter((row) => !row.archived_at)
    .toArray()
  rows.sort(compareByPriorityThenArrival)
  return rows
}

export async function countPendingOutbox() {
  return staffOfflineDb.outbox.filter((r) => !r.synced).count()
}

/**
 * Create a walk-in queue ticket (local-first).
 */
export async function createWalkIn({
  patientName,
  phoneNumber = null,
  reason = null,
  serviceCode = 'RHU',
  serviceName = '',
  patientId = null,
  serviceId = null,
  serviceRequestId = null,
  assignedStaffId = null,
  counterRoom = 'Counter 1',
  isPriority = false,
  priorityLabels = [],
}) {
  const name = (patientName ?? '').toString().trim()
  if (!name) throw new Error('Patient name is required.')

  const { raw, label } = await allocateQueueNumber(serviceCode)
  const waitingLocal = (await listLocalQueue()).filter(
    (r) => (r.status ?? '').toLowerCase() === 'waiting',
  ).length
  const estimatedWait = Math.max(5, waitingLocal * 8)

  const labels = Array.isArray(priorityLabels)
    ? priorityLabels.filter(Boolean)
    : String(priorityLabels || '')
        .split(/[,/|]/)
        .map((x) => x.trim())
        .filter(Boolean)
  const priority = Boolean(isPriority || labels.length > 0)
  const priorityLabel = labels.join(' / ')
  const baseReason = reason || 'Walk-in'
  const reasonWithPriority =
    priority && priorityLabel && !/\[PRIORITY/i.test(baseReason)
      ? `[PRIORITY: ${priorityLabel}] ${baseReason}`
      : baseReason

  const id = newId()
  const now = new Date().toISOString()
  const row = {
    id,
    queue_number: raw,
    queue_label: label,
    patient_name: name,
    reason: reasonWithPriority,
    status: 'waiting',
    appointment_id: null,
    patient_id: patientId,
    phone_number: phoneNumber || null,
    service_code: serviceCode,
    service_id: serviceId,
    service_request_id: serviceRequestId,
    counter_room: counterRoom,
    estimated_waiting_time: estimatedWait,
    is_priority: priority,
    priority_labels: priorityLabel || null,
    archived_at: null,
    created_at: now,
    updated_at: now,
    synced: 0,
    pending_create: 1,
    source: serviceRequestId ? 'staff_encode' : 'walk_in',
  }

  await staffOfflineDb.queue.put(row)
  await enqueueOutbox('queue_create', {
    row,
    serviceName,
    assignedStaffId,
    serviceRequestId,
  })

  return { row, label }
}

/**
 * Update queue status local-first.
 */
export async function updateQueueStatusLocal(item, newStatus, { autoAdvance = false } = {}) {
  if (autoAdvance) {
    if (isOnline()) {
      const { data, error } = await supabase.rpc('advance_queue_status', {
        p_queue_id: item.id,
        p_status: newStatus,
      })
      if (!error) {
        const remoteRows = Array.isArray(data) ? data : []
        await mergeRemoteQueueRows(remoteRows)
        return remoteRows.find((row) => row.id === item.id) ?? { ...item, status: newStatus }
      }
      // The local-first behavior keeps existing deployments usable until the
      // migration below has been applied to Supabase.
      if (error.code !== 'PGRST202') throw new Error(error.message)
    }
    return staffOfflineDb.transaction('rw', staffOfflineDb.queue, staffOfflineDb.outbox, async () => {
      const rows = await staffOfflineDb.queue.toArray()
      const current = rows.find((row) => row.id === item.id)
      if (!current) throw new Error('Queue ticket no longer exists. Refresh the queue.')
      // Ignore a repeated click or a stale screen after another local transition.
      if (current.status !== item.status) throw new Error('Queue status changed. Refresh and try again.')
      const changes = queueAdvanceChanges(rows, item.id, newStatus)
      for (const change of changes) {
        const row = rows.find((entry) => entry.id === change.id)
        await updateQueueStatusLocal({ ...row, ...(row.id === item.id ? item : {}) }, change.status)
      }
      return await staffOfflineDb.queue.get(item.id)
    })
  }
  const now = new Date().toISOString()
  const patch = { status: newStatus, updated_at: now, synced: 0 }
  await staffOfflineDb.queue.update(item.id, patch)
  await enqueueOutbox('queue_update', {
    id: item.id,
    patch: { status: newStatus, updated_at: now },
    notify: {
      patient_name: item.patient_name,
      queue_number: item.queue_number,
      service_code: item.service_code,
      counter_room: item.counter_room,
      appointment_id: item.appointment_id,
      patient_id: item.patient_id,
      patient_email: item.appointment?.patient_email ?? item.patient_email ?? null,
      phone_number: item.phone_number,
    },
  })
  return { ...item, ...patch }
}

export async function archiveQueueLocal(item, archivedBy = null) {
  const now = new Date().toISOString()
  const patch = {
    archived_at: now,
    archived_by: archivedBy,
    updated_at: now,
    synced: 0,
  }
  await staffOfflineDb.queue.update(item.id, patch)
  await enqueueOutbox('queue_update', {
    id: item.id,
    patch: { archived_at: now, archived_by: archivedBy, updated_at: now },
    notify: null,
  })
}

/**
 * Upsert remote rows into local DB (pull merge).
 * Remote wins on status if remote updated_at is newer.
 */
export async function mergeRemoteQueueRows(remoteRows) {
  if (!Array.isArray(remoteRows)) return
  for (const remote of remoteRows) {
    if (!remote?.id) continue
    const local = await staffOfflineDb.queue.get(remote.id)
    if (!local) {
      await staffOfflineDb.queue.put({
        ...remote,
        queue_label:
          remote.queue_label ||
          (remote.queue_number
            ? `${remote.service_code || 'RHU'}-${String(remote.queue_number).padStart(3, '0')}`
            : null),
        synced: 1,
        pending_create: 0,
      })
      continue
    }
    if (shouldMergeQueueRow(local, remote)) {
      await staffOfflineDb.queue.put({
        ...local,
        ...remote,
        queue_label:
          remote.queue_label ||
          local.queue_label ||
          (remote.queue_number
            ? `${remote.service_code || 'RHU'}-${String(remote.queue_number).padStart(3, '0')}`
            : null),
        synced: 1,
        pending_create: 0,
      })
    }
  }
}

export { allocateQueueNumber, enqueueOutbox }
