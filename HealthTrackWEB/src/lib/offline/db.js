import Dexie from 'dexie'

export const staffOfflineDb = new Dexie('healthtrack_staff_offline')

staffOfflineDb.version(1).stores({
  queue: 'id, status, created_at, service_code, synced, archived_at',
  patientsCache: 'id, patient_auth_id, name',
  meta: 'key',
  outbox: '++id, created_at, synced, type',
})

// Paperless offline: forms, clinical records, schedules, document blobs
staffOfflineDb.version(2).stores({
  queue: 'id, status, created_at, service_code, synced, archived_at',
  patientsCache: 'id, patient_auth_id, name',
  meta: 'key',
  outbox: '++id, created_at, synced, type',
  patientRecords: 'id, queue_id, patient_id, synced, updated_at',
  formResponses: '[service_request_id+workflow_step_id], service_request_id, synced, updated_at',
  schedules: 'id, kind, patient_id, patient_auth_id, service_request_id, synced, updated_at',
  documents: 'id, patient_auth_id, service_request_id, synced, created_at',
})

export async function getMeta(key, fallback = null) {
  const row = await staffOfflineDb.meta.get(key)
  return row ? row.value : fallback
}

export async function setMeta(key, value) {
  await staffOfflineDb.meta.put({ key, value })
}

export async function getOrCreateDeviceId() {
  let id = await getMeta('deviceId')
  if (!id) {
    id = crypto.randomUUID().slice(0, 6).toUpperCase()
    await setMeta('deviceId', id)
  }
  return id
}

export function todayKey() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export async function enqueueStaffOutbox(type, payload) {
  await staffOfflineDb.outbox.add({
    type,
    payload,
    created_at: new Date().toISOString(),
    synced: 0,
    attempts: 0,
  })
}
