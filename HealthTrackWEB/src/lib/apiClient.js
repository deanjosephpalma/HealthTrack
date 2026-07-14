import { PORTAL } from './supabaseClient'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

function readCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

let csrfReady = false

export async function ensureCsrf() {
  if (csrfReady && readCookie('XSRF-TOKEN')) return
  csrfReady = false
  const res = await fetch('/sanctum/csrf-cookie', {
    method: 'GET',
    credentials: 'include',
  })
  if (!res.ok) {
    await fetch(`${API_BASE.replace(/\/api$/, '')}/sanctum/csrf-cookie`, {
      method: 'GET',
      credentials: 'include',
    }).catch(() => null)
  }
  // Only mark ready when the XSRF cookie is actually present.
  if (readCookie('XSRF-TOKEN')) {
    csrfReady = true
    return
  }
  throw new Error('Unable to establish CSRF cookie. Check API proxy / Sanctum config.')
}

export async function apiFetch(path, { method = 'GET', body = undefined, portal = PORTAL } = {}) {
  await ensureCsrf()

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-HealthTrack-Portal': portal,
  }

  const xsrf = readCookie('XSRF-TOKEN')
  if (xsrf) headers['X-XSRF-TOKEN'] = xsrf

  const res = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await res.text().catch(() => '')
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }

  if (!res.ok) {
    const message = json?.error || json?.message || text || `HTTP ${res.status}`
    const err = new Error(message)
    err.status = res.status
    err.payload = json
    throw err
  }

  return json
}

export async function loginWithPassword({ email, password, portal = PORTAL }) {
  return apiFetch('/auth/login', {
    method: 'POST',
    portal,
    body: { email, password, portal },
  })
}

export async function fetchAuthMe(portal = PORTAL) {
  return apiFetch('/auth/me', { method: 'GET', portal })
}

export async function refreshAuthSession(portal = PORTAL) {
  return apiFetch('/auth/refresh', { method: 'POST', portal })
}
