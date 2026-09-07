import { PORTAL } from './supabaseClient'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

function readCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

let csrfReady = false

export async function ensureCsrf(portal = PORTAL) {
  if (csrfReady && readCookie('XSRF-TOKEN')) return
  csrfReady = false
  const csrfUrl = API_BASE === '/api'
    ? '/sanctum/csrf-cookie'
    : `${API_BASE.replace(/\/api$/, '')}/sanctum/csrf-cookie`
  await fetch(csrfUrl, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-HealthTrack-Portal': portal,
    },
  }).catch(() => null)
  if (readCookie('XSRF-TOKEN')) {
    csrfReady = true
    return
  }
  throw new Error('Unable to establish CSRF cookie. Check API proxy / Sanctum config.')
}

export async function apiFetch(path, { method = 'GET', body = undefined, portal = PORTAL } = {}) {
  await ensureCsrf(portal)
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
    if (res.status === 419) {
      csrfReady = false
      await ensureCsrf(portal)
      headers['X-XSRF-TOKEN'] = readCookie('XSRF-TOKEN') || ''
      const retry = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
        method,
        headers,
        credentials: 'include',
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const retryText = await retry.text().catch(() => '')
      let retryJson = null
      try {
        retryJson = retryText ? JSON.parse(retryText) : null
      } catch {
        retryJson = null
      }
      if (!retry.ok) {
        const message = retryJson?.error || retryJson?.message || retryText || `HTTP ${retry.status}`
        const err = new Error(message)
        err.status = retry.status
        err.payload = retryJson
        throw err
      }
      return retryJson
    }

    const message = json?.error || json?.message || text || `HTTP ${res.status}`
    const err = new Error(message)
    err.status = res.status
    err.payload = json
    throw err
  }

  return json
}

export async function loginWithPassword({ email, username, password }) {
  const body = { password, portal: PORTAL }
  if (username) body.username = username
  if (email) body.email = email
  return apiFetch('/auth/login', {
    method: 'POST',
    body,
  })
}

export async function registerPatientAccount(payload) {
  return apiFetch('/auth/patient-register', {
    method: 'POST',
    body: payload,
  })
}

export async function fetchPatientAddressOptions() {
  return apiFetch('/geo/patient-address')
}

export async function bridgeAuthSession({ accessToken, refreshToken = null, expiresIn = 3600 }) {
  return apiFetch('/auth/bridge-session', {
    method: 'POST',
    body: {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      portal: PORTAL,
    },
  })
}

export async function fetchAuthMe() {
  return apiFetch('/auth/me')
}

export async function refreshAuthSession() {
  return apiFetch('/auth/refresh', { method: 'POST' })
}

export async function logoutSession() {
  return apiFetch('/auth/logout', { method: 'POST' })
}

export async function requestPasswordReset({ email }) {
  return apiFetch('/auth/password-reset/request', {
    method: 'POST',
    body: { email, portal: PORTAL },
  })
}

export async function confirmPasswordReset({ email, token, password, passwordConfirmation }) {
  return apiFetch('/auth/password-reset/confirm', {
    method: 'POST',
    body: {
      email,
      token,
      password,
      password_confirmation: passwordConfirmation,
      portal: PORTAL,
    },
  })
}
