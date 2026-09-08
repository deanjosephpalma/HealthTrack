import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { applySupabaseSession, logAuditEvent, PORTAL, prepareFreshStaffSession } from '../lib/supabaseClient'
import { loginWithPassword } from '../lib/apiClient'
import { useAuth } from '../context/useAuth'
import PasswordField from '../components/PasswordField'
import { isStaffPortalRole } from '../config/rbac'
import {
  clearLoginLockout,
  getLockoutSecondsRemaining,
  readLoginLockout,
  registerLoginFailure,
  writeLoginLockout,
} from '../lib/loginLockout'

const LOCKOUT_KEY = 'ht_staff_login_lock'
const MAX_FAILURES = 3
const LOCKOUT_MS = 30_000

function StaffBrandMark() {
  return (
    <span className="auth-brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3c-2.8 2.2-4.5 4.8-4.5 7.4a4.5 4.5 0 009 0C16.5 7.8 14.8 5.2 12 3z" />
        <path d="M8 14.5c-1.6.9-2.5 2.2-2.5 3.7A3.5 3.5 0 009 21.7" />
        <path d="M16 14.5c1.6.9 2.5 2.2 2.5 3.7a3.5 3.5 0 01-3.5 3.5" />
        <path d="M12 11v4" />
      </svg>
    </span>
  )
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, role, loading: authLoading, profileLoading, profileError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState(() => (location.state?.message ? String(location.state.message) : ''))
  const [submitting, setSubmitting] = useState(false)
  const [lockRemaining, setLockRemaining] = useState(() => getLockoutSecondsRemaining(readLoginLockout(LOCKOUT_KEY).until))

  useEffect(() => {
    if (authLoading || profileLoading) return

    if (user && isStaffPortalRole(role)) {
      navigate('/dashboard', { replace: true })
    }
  }, [authLoading, navigate, profileLoading, role, user])

  useEffect(() => {
    const tick = () => {
      const until = readLoginLockout(LOCKOUT_KEY).until
      const secs = getLockoutSecondsRemaining(until)
      setLockRemaining(secs)
      if (secs <= 0 && until) {
        clearLoginLockout(LOCKOUT_KEY)
      }
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [])

  const lockedOut = lockRemaining > 0

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    setInfo('')

    const lock = readLoginLockout(LOCKOUT_KEY)
    const secsLeft = getLockoutSecondsRemaining(lock.until)
    if (secsLeft > 0) {
      setError(`Too many failed attempts. Try again in ${secsLeft}s.`)
      setLockRemaining(secsLeft)
      setSubmitting(false)
      return
    }

    try {
      const result = await loginWithPassword({ email, password, portal: PORTAL })
      if (!result?.ok || !result.supabase) {
        throw new Error(result?.error || 'Invalid email or password.')
      }

      await prepareFreshStaffSession(result.user?.id)
      await applySupabaseSession(result.supabase)
      clearLoginLockout(LOCKOUT_KEY)
      setLockRemaining(0)
      void logAuditEvent({
        action: 'login_success',
        entityType: 'auth',
        metadata: { email: result.user?.email ?? email },
      })
    } catch (err) {
      const status = err?.status
      if (status === 429) {
        const forced = {
          failures: MAX_FAILURES,
          until: Date.now() + LOCKOUT_MS,
        }
        writeLoginLockout(LOCKOUT_KEY, forced)
        setLockRemaining(getLockoutSecondsRemaining(forced.until))
        setError(`Too many failed attempts. Locked for ${LOCKOUT_MS / 1000}s.`)
        setPassword('')
        setSubmitting(false)
        return
      }

      const next = registerLoginFailure(LOCKOUT_KEY, { maxFailures: MAX_FAILURES, lockoutMs: LOCKOUT_MS })
      setLockRemaining(getLockoutSecondsRemaining(next.until))
      setPassword('')
      if (next.locked) {
        setError(`Too many failed attempts. Locked for ${LOCKOUT_MS / 1000}s.`)
      } else {
        const left = next.remainingAttempts
        setError(
          `${err?.message || 'Invalid email or password.'} ${left} attempt${left === 1 ? '' : 's'} left before a ${LOCKOUT_MS / 1000}s lock.`,
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-screen staff-login-page">
      <div className="auth-screen-inner staff-login-shell">
        <aside className="auth-intro-panel" aria-label="HealthTrack staff workspace">
          <div>
            <p className="auth-intro-eyebrow">RHU Pila / Operations</p>
            <h2>Care moves better when the whole team sees the same picture.</h2>
            <p className="auth-intro-copy">
              Start the day with one calm workspace for queues, records, follow-ups, and community signals.
            </p>
          </div>
          <div className="auth-intro-metrics">
            <div>
              <strong>01</strong>
              <span>Shared patient context</span>
            </div>
            <div>
              <strong>24/7</strong>
              <span>Paperless access</span>
            </div>
          </div>
        </aside>
        <section className="auth-card">
          <header className="auth-card-header">
            <div className="auth-brand-row">
              <StaffBrandMark />
              <div>
                <p className="chip mb-0!">Staff Portal</p>
              </div>
            </div>
            <h1 className="auth-title">Welcome back</h1>
            <p className="auth-subtitle">
              Sign in to the HealthTrack console for Rural Health Unit of Pila.
            </p>
            <div className="auth-role-pills" aria-label="Supported staff roles">
              <span className="auth-role-pill">Admin</span>
              <span className="auth-role-pill">Doctor</span>
              <span className="auth-role-pill">Nurse</span>
              <span className="auth-role-pill">BHW</span>
              <span className="auth-role-pill">Volunteer</span>
            </div>
          </header>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div>
              <label className="field-label" htmlFor="email">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                className="field-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@rhu.pila.gov.ph"
                autoComplete="username"
                disabled={lockedOut || submitting}
              />
            </div>

            <PasswordField
              id="password"
              label="Password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={lockedOut || submitting}
            />

            {lockedOut ? (
              <p className="error-banner" role="alert">
                Account temporarily locked after {MAX_FAILURES} failed attempts. Try again in{' '}
                <strong>{lockRemaining}s</strong>.
              </p>
            ) : null}
            {error && !lockedOut ? <p className="error-banner">{error}</p> : null}
            {info && !error ? <p className="info-banner">{info}</p> : null}
            {profileError && !error && !lockedOut ? <p className="error-banner">{profileError}</p> : null}

            <div className="auth-actions">
              <button type="submit" className="primary-btn" disabled={submitting || lockedOut}>
                {submitting ? 'Signing in…' : lockedOut ? `Wait ${lockRemaining}s` : 'Sign in to dashboard'}
              </button>
            </div>
          </form>

          <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
            Staff accounts are issued by RHU administrators. Patients should use the patient portal instead.
          </p>
        </section>
      </div>
    </main>
  )
}
