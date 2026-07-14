import { supabase } from '../supabaseClient'
import { patientOfflineDb, getMeta, setMeta, getOrCreateDeviceId, todayKey } from './db'
import { isOnline } from './connectivity'

function newId() {
  return crypto.randomUUID()
}

async function nextOfflineQueueNumber(serviceCode) {
  const prefix = serviceCode || 'RHU'
  const key = `seq:${todayKey()}:${prefix}`
  const current = Number(await getMeta(key, 0)) || 0
  const localRows = await patientOfflineDb.queue.where('service_code').equals(prefix).toArray()
  const fromLocal = localRows.reduce((max, row) => {
    const n = Number(row.queue_number) || 0
    return n > max ? n : max
  }, 0)
  const next = Math.max(current, fromLocal) + 1
  await setMeta(key, next)
  await getOrCreateDeviceId()
  return {
    raw: next,
    label: `${prefix}-${String(next).padStart(3, '0')}`,
  }
}

async function allocateQueueNumber(serviceCode) {
  if (isOnline()) {
    try {
      const prefix = serviceCode || 'RHU'
      const { data: rpcNumber, error: rpcError } = await supabase.rpc('next_queue_number', {
        p_service_code: prefix,
      })
      if (!rpcError && rpcNumber != null) {
        const next = Number(rpcNumber)
        if (Number.isFinite(next) && next > 0) {
          return { raw: next, label: `${prefix}-${String(next).padStart(3, '0')}` }
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
      return { raw: next, label: `${prefix}-${String(next).padStart(3, '0')}` }
    } catch {
      return nextOfflineQueueNumber(serviceCode)
    }
  }
  return nextOfflineQueueNumber(serviceCode)
}

async function enqueueOutbox(type, payload) {
  await patientOfflineDb.outbox.add({
    type,
    payload,
    created_at: new Date().toISOString(),
    synced: 0,
    attempts: 0,
  })
}

export async function listMyLocalTickets({ patientId, patientAuthId } = {}) {
  const rows = await patientOfflineDb.queue.toArray()
  return rows
    .filter((row) => {
      if (row.archived_at) return false
      if (patientId && row.patient_id === patientId) return true
      if (patientAuthId && row.patient_auth_id === patientAuthId) return true
      return false
    })
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

export async function countPendingOutbox() {
  return patientOfflineDb.outbox.filter((r) => !r.synced).count()
}

function buildInsertPayload(row) {
  return {
    id: row.id,
    queue_number: row.queue_number,
    patient_name: row.patient_name,
    reason: row.reason,
    status: row.status || 'waiting',
    appointment_id: null,
    patient_id: row.patient_id ?? null,
    phone_number: row.phone_number ?? null,
    service_code: row.service_code ?? 'RHU',
    counter_room: row.counter_room ?? 'Counter 1',
    estimated_waiting_time: row.estimated_waiting_time ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  }
}

async function linkServiceRequest(row) {
  if (row.service_request_id) {
    await supabase
      .from('service_requests')
      .update({
        queue_id: row.id,
        status: 'In Queue',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.service_request_id)
  }
}

/**
 * Patient self-join queue (online-first when possible, local-first offline).
 */
export async function joinQueue({
  patientName,
  patientId = null,
  patientAuthId = null,
  phoneNumber = null,
  reason = null,
  serviceCode = 'RHU',
  serviceId = null,
  serviceRequestId = null,
  patientEmail = null,
}) {
  const name = (patientName ?? '').toString().trim()
  if (!name) throw new Error('Patient name is required.')

  let resolvedPatientId = patientId
  if (!resolvedPatientId && patientAuthId && isOnline()) {
    const { data: patientRow } = await supabase
      .from('patients')
      .select('id')
      .eq('patient_auth_id', patientAuthId)
      .maybeSingle()
    resolvedPatientId = patientRow?.id ?? null
  }

  // Block duplicate active tickets same day for this patient (local)
  const existing = await listMyLocalTickets({ patientId: resolvedPatientId, patientAuthId })
  const active = existing.find((r) =>
    ['waiting', 'next', 'called', 'skipped'].includes((r.status ?? '').toLowerCase()),
  )
  if (active) {
    // If online, verify remote status — local may be stale after staff completed the ticket
    if (isOnline() && active.id) {
      const { data: remote } = await supabase
        .from('queue')
        .select('id, status, archived_at')
        .eq('id', active.id)
        .maybeSingle()
      const remoteStatus = (remote?.status ?? '').toLowerCase()
      if (
        remote &&
        !remote.archived_at &&
        ['waiting', 'next', 'called', 'skipped'].includes(remoteStatus)
      ) {
        return {
          row: active,
          label: active.queue_label || `${active.service_code}-${active.queue_number}`,
          alreadyJoined: true,
        }
      }
      // Stale local active ticket — mark completed locally and continue
      await patientOfflineDb.queue.update(active.id, {
        status: remote?.status || 'completed',
        archived_at: remote?.archived_at ?? active.archived_at,
        synced: 1,
        pending_create: 0,
        updated_at: new Date().toISOString(),
      })
    } else {
      return {
        row: active,
        label: active.queue_label || `${active.service_code}-${active.queue_number}`,
        alreadyJoined: true,
      }
    }
  }

  // Also block if remote already has an active ticket for this patient
  if (isOnline() && resolvedPatientId) {
    const { data: remoteActive } = await supabase
      .from('queue')
      .select('id, queue_number, service_code, status, patient_name, reason, created_at')
      .eq('patient_id', resolvedPatientId)
      .is('archived_at', null)
      .in('status', ['waiting', 'next', 'called', 'skipped'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (remoteActive) {
      const label = `${remoteActive.service_code || serviceCode || 'RHU'}-${String(remoteActive.queue_number).padStart(3, '0')}`
      await patientOfflineDb.queue.put({
        ...remoteActive,
        queue_label: label,
        patient_id: resolvedPatientId,
        patient_auth_id: patientAuthId,
        synced: 1,
        pending_create: 0,
      })
      return { row: remoteActive, label, alreadyJoined: true }
    }
  }

  const { raw, label } = await allocateQueueNumber(serviceCode)
  const id = newId()
  const now = new Date().toISOString()
  const row = {
    id,
    queue_number: raw,
    queue_label: label,
    patient_name: name,
    reason: reason || 'Patient self-join',
    status: 'waiting',
    appointment_id: null,
    patient_id: resolvedPatientId,
    patient_auth_id: patientAuthId,
    phone_number: phoneNumber || null,
    patient_email: patientEmail || null,
    service_code: serviceCode || 'RHU',
    service_id: serviceId,
    service_request_id: serviceRequestId,
    counter_room: 'Counter 1',
    estimated_waiting_time: null,
    archived_at: null,
    created_at: now,
    updated_at: now,
    synced: 0,
    pending_create: 1,
    source: 'patient_self',
  }

  await patientOfflineDb.queue.put(row)

  if (isOnline()) {
    const { error } = await supabase.from('queue').upsert([buildInsertPayload(row)], { onConflict: 'id' })
    if (error) {
      await enqueueOutbox('queue_create', { row })
      return {
        row,
        label,
        alreadyJoined: false,
        syncWarning: error.message || 'Saved offline; waiting to sync to RHU.',
      }
    }
    await patientOfflineDb.queue.update(row.id, { synced: 1, pending_create: 0 })
    try {
      await linkServiceRequest(row)
    } catch {
      /* non-fatal */
    }
    return { row: { ...row, synced: 1, pending_create: 0 }, label, alreadyJoined: false }
  }

  await enqueueOutbox('queue_create', { row })
  return { row, label, alreadyJoined: false }
}

const ACTIVE_QUEUE_STATUSES = new Set(['waiting', 'next', 'called', 'skipped'])

export async function mergeRemoteTickets(remoteRows, { patientId, patientAuthId } = {}) {
  if (!Array.isArray(remoteRows)) return
  for (const remote of remoteRows) {
    if (!remote?.id) continue
    const local = await patientOfflineDb.queue.get(remote.id)
    // Own ticket if we already have it locally, or it matches this patient
    const mine =
      Boolean(local) ||
      (patientId && remote.patient_id === patientId) ||
      (patientAuthId && remote.patient_auth_id === patientAuthId)
    if (!mine) continue

    const queueLabel =
      remote.queue_label ||
      local?.queue_label ||
      (remote.queue_number
        ? `${remote.service_code || 'RHU'}-${String(remote.queue_number).padStart(3, '0')}`
        : null)

    if (!local) {
      await patientOfflineDb.queue.put({
        ...remote,
        patient_auth_id: remote.patient_auth_id || patientAuthId || null,
        queue_label: queueLabel,
        synced: 1,
        pending_create: 0,
      })
      continue
    }

    // Staff status (called/completed/…) is server truth — always apply remote row
    await patientOfflineDb.queue.put({
      ...local,
      ...remote,
      patient_auth_id: local.patient_auth_id || remote.patient_auth_id || patientAuthId || null,
      queue_label: queueLabel,
      synced: 1,
      pending_create: 0,
    })
  }
}

/** Fetch remote status for local tickets still marked active (covers null patient_id / stale UI). */
export async function reconcileLocalActiveTickets({ patientId, patientAuthId } = {}) {
  const local = await listMyLocalTickets({ patientId, patientAuthId })
  const activeIds = local
    .filter((t) => ACTIVE_QUEUE_STATUSES.has((t.status ?? '').toLowerCase()))
    .map((t) => t.id)
    .filter(Boolean)
  if (activeIds.length === 0) return []

  const { data, error } = await supabase
    .from('queue')
    .select(
      'id, queue_number, patient_id, patient_name, reason, status, created_at, updated_at, phone_number, counter_room, estimated_waiting_time, service_code, archived_at',
    )
    .in('id', activeIds)
  if (error) throw new Error(error.message)

  const rows = data ?? []
  await mergeRemoteTickets(rows, { patientId, patientAuthId })
  return rows
}

export { buildInsertPayload, linkServiceRequest }
