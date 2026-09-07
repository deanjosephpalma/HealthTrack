import { createClient } from '@supabase/supabase-js'
import { memoryAuthStorage } from './memoryAuthStorage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.',
  )
}

export const PORTAL = 'staff'
export const STAFF_AUTH_STORAGE_KEY = 'healthtrack_staff_auth_memory'
/** Opaque user id only — ties IndexedDB to the last authenticated staff user. */
const STAFF_IDB_OWNER_KEY = 'ht_staff_idb_owner'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storage: memoryAuthStorage,
    storageKey: STAFF_AUTH_STORAGE_KEY,
    flowType: 'implicit',
  },
})

export async function logAuditEvent({ action, entityType, entityId = null, metadata = {} }) {
  try {
    const { error } = await supabase.rpc('log_audit_event', {
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_metadata: metadata,
    })
    if (error && import.meta.env.DEV) {
      console.warn('[audit]', error.message)
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[audit]', err?.message || err)
    }
  }
}

export async function clearOfflineStores({ clearOwner = true } = {}) {
  try {
    const { staffOfflineDb } = await import('./offline/db')
    await Promise.all(staffOfflineDb.tables.map((table) => table.clear()))
  } catch {
    /* ignore */
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.includes('api-cache')).map((k) => caches.delete(k)))
    }
  } catch {
    /* ignore */
  }

  try {
    localStorage.removeItem('healthtrack_staff_auth')
    sessionStorage.removeItem('ht_staff_login_lock')
    if (clearOwner) localStorage.removeItem(STAFF_IDB_OWNER_KEY)
  } catch {
    /* ignore */
  }

  memoryAuthStorage.clear()
}

function readStaffIdbOwner() {
  try {
    return localStorage.getItem(STAFF_IDB_OWNER_KEY)
  } catch {
    return null
  }
}

function writeStaffIdbOwner(userId) {
  try {
    if (userId) localStorage.setItem(STAFF_IDB_OWNER_KEY, userId)
    else localStorage.removeItem(STAFF_IDB_OWNER_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Password login / account switch: always wipe local PHI, then claim IDB for this user.
 */
export async function prepareFreshStaffSession(userId) {
  await clearOfflineStores({ clearOwner: false })
  writeStaffIdbOwner(userId || null)
}

/**
 * Cookie restore on reload: wipe only if IDB belongs to a different user (or no owner yet).
 */
export async function ensureStaffOfflineNamespace(userId) {
  if (!userId) {
    await clearOfflineStores()
    return
  }
  const owner = readStaffIdbOwner()
  if (owner !== userId) {
    await clearOfflineStores({ clearOwner: false })
    writeStaffIdbOwner(userId)
  }
}

export async function applySupabaseSession(tokens) {
  if (!tokens?.access_token) return null
  // Refresh token is BFF-only (Laravel HttpOnly session). supabase-js still requires a
  // refresh_token field for setSession — reuse access JWT as a non-persistent placeholder.
  const { data, error } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.access_token,
  })
  if (error) throw error
  if (data.session?.user?.id) writeStaffIdbOwner(data.session.user.id)
  return data.session
}

export async function secureSignOut() {
  try {
    await logAuditEvent({ action: 'logout', entityType: 'auth', metadata: {} })
  } catch {
    /* ignore */
  }

  try {
    const { apiFetch } = await import('./apiClient')
    await apiFetch('/auth/logout', { method: 'POST', portal: PORTAL })
  } catch {
    /* ignore */
  }

  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    /* ignore */
  }

  await clearOfflineStores()
}
