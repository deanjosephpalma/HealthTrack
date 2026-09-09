import { patientOfflineDb, enqueuePatientOutbox, setMeta, getMeta } from './db'
import { isOnline } from './connectivity'

function newId() {
  return crypto.randomUUID()
}

/** Local-first patient intake / form response. */
export async function saveFormResponseLocal({ serviceRequestId, workflowStepId, responseData }) {
  const now = new Date().toISOString()
  const row = {
    service_request_id: serviceRequestId,
    workflow_step_id: workflowStepId,
    response_data: responseData,
    updated_at: now,
    synced: 0,
  }
  if (workflowStepId) {
    await patientOfflineDb.formResponses.put(row)
    await enqueuePatientOutbox('form_response_upsert', { row })
  }
  return { row, offline: !isOnline() }
}

/** Mark service request Ready (or other status) via outbox. */
export async function enqueueServiceRequestUpdate(id, patch) {
  await enqueuePatientOutbox('service_request_update', { id, patch })
}

/** Cache follow-up schedules for offline viewing. */
export async function cacheFollowUpSchedules({ animalBite = [], tb = [], outpatient = [] }) {
  const now = new Date().toISOString()
  for (const row of animalBite) {
    await patientOfflineDb.schedules.put({
      ...row,
      kind: 'animal_bite',
      updated_at: now,
      synced: 1,
    })
  }
  for (const row of tb) {
    await patientOfflineDb.schedules.put({
      ...row,
      kind: 'tb',
      updated_at: now,
      synced: 1,
    })
  }
  for (const row of outpatient) {
    await patientOfflineDb.schedules.put({
      ...row,
      kind: 'outpatient',
      updated_at: now,
      synced: 1,
    })
  }
  await setMeta('followupsCachedAt', now)
}

export async function listCachedFollowUps(patientAuthId) {
  const rows = await patientOfflineDb.schedules
    .where('patient_auth_id')
    .equals(patientAuthId)
    .toArray()
  return {
    animalBite: rows.filter((r) => r.kind === 'animal_bite'),
    tb: rows.filter((r) => r.kind === 'tb'),
    outpatient: rows.filter((r) => r.kind === 'outpatient'),
    cachedAt: await getMeta('followupsCachedAt'),
  }
}

/** Queue a document for later Storage upload. */
export async function saveDocumentLocal({
  file,
  documentName,
  patientAuthId = null,
  serviceRequestId = null,
}) {
  if (!file) throw new Error('File is required.')
  const id = newId()
  const now = new Date().toISOString()
  const blob = file instanceof Blob ? file : new Blob([file])
  const row = {
    id,
    document_name: documentName || file.name || 'document',
    file_name: file.name || 'document',
    mime_type: file.type || 'application/octet-stream',
    size: blob.size,
    blob,
    patient_auth_id: patientAuthId,
    service_request_id: serviceRequestId,
    created_at: now,
    synced: 0,
  }
  await patientOfflineDb.documents.put(row)
  await enqueuePatientOutbox('document_upload', { id })
  return { row: { ...row, blob: undefined }, offline: !isOnline() }
}

export async function listLocalDocuments({ serviceRequestId, patientAuthId } = {}) {
  let rows = await patientOfflineDb.documents.toArray()
  if (serviceRequestId) rows = rows.filter((r) => r.service_request_id === serviceRequestId)
  if (patientAuthId) rows = rows.filter((r) => r.patient_auth_id === patientAuthId)
  return rows.map((r) => ({ ...r, blob: undefined, hasBlob: Boolean(r.blob) }))
}

export async function removeDocumentLocal(id) {
  const doc = await patientOfflineDb.documents.get(id)
  if (!doc) return { removed: false }

  const pendingUploads = await patientOfflineDb.outbox.where('type').equals('document_upload').toArray()
  await Promise.all(
    pendingUploads
      .filter((job) => job.payload?.id === id && !job.synced)
      .map((job) => patientOfflineDb.outbox.delete(job.id)),
  )

  await patientOfflineDb.documents.delete(id)
  if (doc.synced && (doc.file_path || doc.id)) {
    await enqueuePatientOutbox('document_delete', {
      id: doc.id,
      filePath: doc.file_path || null,
      patientAuthId: doc.patient_auth_id || null,
    })
  }

  return { removed: true, offline: !isOnline() }
}
