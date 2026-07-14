import { generateQueueNumber } from '../workflowEngine'
import { staffOfflineDb, getMeta, setMeta, getOrCreateDeviceId, todayKey } from './db'
import { isOnline } from './connectivity'

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
  rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
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
  assignedStaffId = null,
  counterRoom = 'Counter 1',
}) {
  const name = (patientName ?? '').toString().trim()
  if (!name) throw new Error('Patient name is required.')

  const { raw, label } = await allocateQueueNumber(serviceCode)
  const waitingLocal = (await listLocalQueue()).filter(
    (r) => (r.status ?? '').toLowerCase() === 'waiting',
  ).length
  const estimatedWait = Math.max(5, waitingLocal * 8)

  const id = newId()
  const now = new Date().toISOString()
  const row = {
    id,
    queue_number: raw,
    queue_label: label,
    patient_name: name,
    reason: reason || 'Walk-in',
    status: 'waiting',
    appointment_id: null,
    patient_id: patientId,
    phone_number: phoneNumber || null,
    service_code: serviceCode,
    service_id: serviceId,
    counter_room: counterRoom,
    estimated_waiting_time: estimatedWait,
    archived_at: null,
    created_at: now,
    updated_at: now,
    synced: 0,
    pending_create: 1,
    source: 'walk_in',
  }

  await staffOfflineDb.queue.put(row)
  await enqueueOutbox('queue_create', {
    row,
    serviceName,
    assignedStaffId,
  })

  return { row, label }
}

/**
 * Update queue status local-first.
 */
export async function updateQueueStatusLocal(item, newStatus) {
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
    if (local.pending_create) continue
    const remoteTs = Date.parse(remote.updated_at || remote.created_at || 0) || 0
    const localTs = Date.parse(local.updated_at || local.created_at || 0) || 0
    if (remoteTs >= localTs) {
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
