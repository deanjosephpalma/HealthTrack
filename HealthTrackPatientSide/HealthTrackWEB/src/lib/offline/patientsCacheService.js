import { supabase } from '../supabaseClient'
import { isOnline } from './connectivity'
import { staffOfflineDb } from './db'

export const PATIENTS_CACHE_SELECT =
  'id, patient_auth_id, patient_number, name, first_name, middle_name, last_name, phone, mobile_phone, barangay, municipality, queue_id, archived_at, updated_at, created_at'

function composeName(row = {}) {
  const composed = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ').trim()
  return composed || row.name || 'Patient'
}

function normalizePatientRow(row) {
  if (!row?.id) return null
  return {
    id: row.id,
    patient_auth_id: row.patient_auth_id ?? null,
    patient_number: row.patient_number ?? null,
    name: composeName(row),
    first_name: row.first_name ?? null,
    middle_name: row.middle_name ?? null,
    last_name: row.last_name ?? null,
    phone: row.phone ?? row.mobile_phone ?? null,
    mobile_phone: row.mobile_phone ?? row.phone ?? null,
    barangay: row.barangay ?? null,
    municipality: row.municipality ?? null,
    queue_id: row.queue_id ?? null,
    archived_at: row.archived_at ?? null,
    updated_at: row.updated_at ?? row.created_at ?? new Date().toISOString(),
    created_at: row.created_at ?? null,
    cached_at: new Date().toISOString(),
  }
}

export async function upsertPatientsCache(rows) {
  const list = (Array.isArray(rows) ? rows : [])
    .map(normalizePatientRow)
    .filter(Boolean)
  if (list.length === 0) return 0
  await staffOfflineDb.patientsCache.bulkPut(list)
  return list.length
}

export async function getPatientCacheById(id) {
  if (!id) return null
  return (await staffOfflineDb.patientsCache.get(id)) || null
}

export async function getPatientCacheByAuthId(patientAuthId) {
  if (!patientAuthId) return null
  return (await staffOfflineDb.patientsCache.where('patient_auth_id').equals(patientAuthId).first()) || null
}

export async function listPatientsCache({ limit = 200, offset = 0 } = {}) {
  const all = await staffOfflineDb.patientsCache
    .orderBy('name')
    .filter((row) => !row.archived_at)
    .toArray()
  return all.slice(offset, offset + limit)
}

export async function searchPatientsCache(query, { limit = 80 } = {}) {
  const q = (query || '').toString().trim().toLowerCase()
  const all = await staffOfflineDb.patientsCache.filter((row) => !row.archived_at).toArray()
  if (!q) {
    return all
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .slice(0, limit)
  }
  return all
    .filter((row) => {
      const hay = [
        row.name,
        row.first_name,
        row.middle_name,
        row.last_name,
        row.patient_number,
        row.phone,
        row.mobile_phone,
        row.barangay,
        row.municipality,
        row.queue_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .slice(0, limit)
}

/**
 * Pull active patients into IndexedDB for offline directory search.
 * Paginates to avoid huge single responses.
 */
export async function pullPatientsDirectory({ pageSize = 500, maxPages = 4 } = {}) {
  if (!isOnline()) return { ok: false, reason: 'offline', count: 0 }

  let total = 0
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('patients')
      .select(PATIENTS_CACHE_SELECT)
      .is('archived_at', null)
      .order('updated_at', { ascending: false })
      .range(from, to)

    if (error) {
      // updated_at may be missing on older DBs — fall back to created_at once
      if (page === 0 && /updated_at/i.test(error.message || '')) {
        const fallback = await supabase
          .from('patients')
          .select(PATIENTS_CACHE_SELECT.replace(', updated_at', ''))
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .range(from, to)
        if (fallback.error) throw new Error(fallback.error.message)
        const n = await upsertPatientsCache(fallback.data ?? [])
        total += n
        if ((fallback.data ?? []).length < pageSize) break
        continue
      }
      throw new Error(error.message)
    }

    const batch = data ?? []
    total += await upsertPatientsCache(batch)
    if (batch.length < pageSize) break
  }

  return { ok: true, count: total }
}
