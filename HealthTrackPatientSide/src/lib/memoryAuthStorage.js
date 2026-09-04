/**
 * In-memory auth storage — never persist access tokens to localStorage.
 * Reloads restore session via Laravel HttpOnly cookie (/api/auth/me).
 *
 * PKCE code verifiers MUST survive the Google OAuth full-page redirect,
 * so those keys alone are kept in sessionStorage (cleared when the tab closes).
 */
const store = new Map()

function isPkceVerifierKey(key) {
  return typeof key === 'string' && key.includes('code-verifier')
}

export const memoryAuthStorage = {
  getItem(key) {
    if (isPkceVerifierKey(key)) {
      try {
        return sessionStorage.getItem(key)
      } catch {
        return null
      }
    }
    return store.has(key) ? store.get(key) : null
  },
  setItem(key, value) {
    if (isPkceVerifierKey(key)) {
      try {
        sessionStorage.setItem(key, value)
      } catch {
        /* ignore */
      }
      return
    }
    store.set(key, value)
  },
  removeItem(key) {
    if (isPkceVerifierKey(key)) {
      try {
        sessionStorage.removeItem(key)
      } catch {
        /* ignore */
      }
      return
    }
    store.delete(key)
  },
  clear() {
    store.clear()
  },
}
