import { createClient } from '@supabase/supabase-js'
import { memoryAuthStorage } from './memoryAuthStorage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.')
}

export const PORTAL = 'patient'
export const PATIENT_AUTH_STORAGE_KEY = 'healthtrack_patient_auth_memory'
/** Opaque user id only — ties IndexedDB to the last authenticated patient. */
const PATIENT_IDB_OWNER_KEY = 'ht_patient_idb_owner'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storage: memoryAuthStorage,
    storageKey: PATIENT_AUTH_STORAGE_KEY,
    flowType: 'implicit',
  },
})

function readPatientIdbOwner() {
  try {
    return localStorage.getItem(PATIENT_IDB_OWNER_KEY)
  } catch {
    return null
  }
}

function writePatientIdbOwner(userId) {
  try {
    if (userId) localStorage.setItem(PATIENT_IDB_OWNER_KEY, userId)
    else localStorage.removeItem(PATIENT_IDB_OWNER_KEY)
  } catch {
    /* ignore */
  }
}

export async function applySupabaseSession(tokens) {
  if (!tokens?.access_token) return null
  // Refresh token is BFF-only (Laravel HttpOnly session). Placeholder for supabase-js only.
  const { data, error } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.access_token,
  })
  if (error) throw error
  if (data.session?.user?.id) writePatientIdbOwner(data.session.user.id)
  return data.session
}

export async function clearPatientOffline({ clearOwner = true } = {}) {
  try {
    const { patientOfflineDb } = await import('./offline/db')
    await Promise.all(patientOfflineDb.tables.map((table) => table.clear()))
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem('healthtrack_patient_auth')
    if (clearOwner) localStorage.removeItem(PATIENT_IDB_OWNER_KEY)
  } catch {
    /* ignore */
  }
  memoryAuthStorage.clear()
}

/** Password login / account switch: always wipe local PHI. */
export async function prepareFreshPatientSession(userId) {
  await clearPatientOffline({ clearOwner: false })
  writePatientIdbOwner(userId || null)
}

/** Cookie restore: wipe only when IDB owner differs (or is missing). */
export async function ensurePatientOfflineNamespace(userId) {
  if (!userId) {
    await clearPatientOffline()
    return
  }
  const owner = readPatientIdbOwner()
  if (owner !== userId) {
    await clearPatientOffline({ clearOwner: false })
    writePatientIdbOwner(userId)
  }
}
