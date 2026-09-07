const DEFAULTS = {
  maxFailures: 3,
  lockoutMs: 30_000,
}

export function readLoginLockout(storageKey) {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return { failures: 0, until: 0 }
    const parsed = JSON.parse(raw)
    return {
      failures: Number(parsed.failures) || 0,
      until: Number(parsed.until) || 0,
    }
  } catch {
    return { failures: 0, until: 0 }
  }
}

export function writeLoginLockout(storageKey, state) {
  sessionStorage.setItem(
    storageKey,
    JSON.stringify({
      failures: state.failures || 0,
      until: state.until || 0,
    }),
  )
}

export function clearLoginLockout(storageKey) {
  writeLoginLockout(storageKey, { failures: 0, until: 0 })
}

export function registerLoginFailure(storageKey, options = {}) {
  const maxFailures = options.maxFailures ?? DEFAULTS.maxFailures
  const lockoutMs = options.lockoutMs ?? DEFAULTS.lockoutMs
  const current = readLoginLockout(storageKey)
  const failures = (current.failures || 0) + 1
  const until = failures >= maxFailures ? Date.now() + lockoutMs : 0
  const next = { failures, until }
  writeLoginLockout(storageKey, next)
  return {
    ...next,
    maxFailures,
    lockoutMs,
    remainingAttempts: Math.max(0, maxFailures - failures),
    locked: until > Date.now(),
  }
}

export function getLockoutSecondsRemaining(until) {
  if (!until) return 0
  return Math.max(0, Math.ceil((until - Date.now()) / 1000))
}
