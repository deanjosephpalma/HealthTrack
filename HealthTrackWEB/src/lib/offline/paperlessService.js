import { staffOfflineDb, enqueueStaffOutbox } from './db'
import { isOnline } from './connectivity'

function newId() {
  return crypto.randomUUID()
}

/** Local-first patient record upsert (doctor consult / charting). */
export async function savePatientRecordLocal(record) {
  const now = new Date().toISOString()
  const id = record.id || newId()
  const row = {
    ...record,
    id,
    updated_at: now,
    created_at: record.created_at || now,
    synced: 0,
  }
  await staffOfflineDb.patientRecords.put(row)
  await enqueueStaffOutbox('patient_record_upsert', { row })
  return { row, offline: !isOnline() }
}

/** Local-first form response upsert. */
export async function saveFormResponseLocal({ serviceRequestId, workflowStepId, responseData, submittedBy }) {
  const now = new Date().toISOString()
  const row = {
    service_request_id: serviceRequestId,
    workflow_step_id: workflowStepId,
    response_data: responseData,
    submitted_by: submittedBy ?? null,
    updated_at: now,
    synced: 0,
  }
  await staffOfflineDb.formResponses.put(row)
  await enqueueStaffOutbox('form_response_upsert', { row })
  return { row, offline: !isOnline() }
}

/** Local-first follow-up schedule (AB / TB). */
export async function saveScheduleLocal({ kind, row }) {
  const now = new Date().toISOString()
  const id = row.id || newId()
  const local = {
    ...row,
    id,
    kind, // 'animal_bite' | 'tb'
    updated_at: now,
    created_at: row.created_at || now,
    synced: 0,
  }
  await staffOfflineDb.schedules.put(local)
  await enqueueStaffOutbox('followup_schedule_upsert', { kind, row: local })
  return { row: local, offline: !isOnline() }
}

/** Queue a document/file for later upload to Storage + requirements_submissions. */
export async function saveDocumentLocal({
  file,
  documentName,
  patientAuthId = null,
  patientId = null,
  serviceRequestId = null,
  uploadedBy = null,
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
    patient_id: patientId,
    service_request_id: serviceRequestId,
    uploaded_by: uploadedBy,
    created_at: now,
    synced: 0,
  }
  await staffOfflineDb.documents.put(row)
  await enqueueStaffOutbox('document_upload', { id })
  return { row: { ...row, blob: undefined }, offline: !isOnline() }
}

export async function listLocalDocuments({ serviceRequestId, patientAuthId } = {}) {
  let rows = await staffOfflineDb.documents.toArray()
  if (serviceRequestId) rows = rows.filter((r) => r.service_request_id === serviceRequestId)
  if (patientAuthId) rows = rows.filter((r) => r.patient_auth_id === patientAuthId)
  return rows.map((r) => ({ ...r, blob: undefined, hasBlob: Boolean(r.blob) }))
}

/** Queue a service_requests status/patch for later sync. */
export async function enqueueServiceRequestUpdate(id, patch) {
  await enqueueStaffOutbox('service_request_update', { id, patch })
}
