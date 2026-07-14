/**
 * In-memory auth storage — never persist tokens to localStorage.
 * Reloads restore session via Laravel HttpOnly cookie (/api/auth/me).
 */
const store = new Map()

export const memoryAuthStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null
  },
  setItem(key, value) {
    store.set(key, value)
  },
  removeItem(key) {
    store.delete(key)
  },
  clear() {
    store.clear()
  },
}
