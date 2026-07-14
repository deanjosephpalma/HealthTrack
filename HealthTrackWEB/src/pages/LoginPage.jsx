import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { applySupabaseSession, logAuditEvent, PORTAL, prepareFreshStaffSession } from '../lib/supabaseClient'
import { loginWithPassword } from '../lib/apiClient'
import { useAuth } from '../context/useAuth'
import PasswordField from '../components/PasswordField'
import { ROLES } from '../config/rbac'

const LOCKOUT_KEY = 'ht_staff_login_lock'
const MAX_FAILURES = 5
const LOCKOUT_MS = 60_000

function readLockout() {
  try {
    const raw = sessionStorage.getItem(LOCKOUT_KEY)
    if (!raw) return { failures: 0, until: 0 }
    return JSON.parse(raw)
  } catch {
    return { failures: 0, until: 0 }
  }
}

function writeLockout(state) {
  sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify(state))
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { user, role, loading: authLoading, profileLoading, profileError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (authLoading || profileLoading) return

    const validRole = [ROLES.DOCTOR, ROLES.NURSE].includes(role)
    if (user && validRole) {
      navigate('/dashboard', { replace: true })
    }
  }, [authLoading, navigate, profileLoading, role, user])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    const lock = readLockout()
    if (lock.until && Date.now() < lock.until) {
      const secs = Math.ceil((lock.until - Date.now()) / 1000)
      setError(`Too many failed attempts. Try again in ${secs}s.`)
      setSubmitting(false)
      return
    }

    try {
      const result = await loginWithPassword({ email, password, portal: PORTAL })
      if (!result?.ok || !result.supabase) {
        throw new Error(result?.error || 'Login failed')
      }

      await prepareFreshStaffSession(result.user?.id)
      await applySupabaseSession(result.supabase)
      writeLockout({ failures: 0, until: 0 })
      void logAuditEvent({
        action: 'login_success',
        entityType: 'auth',
        metadata: { email: result.user?.email ?? email },
      })
    } catch (err) {
      const failures = (lock.failures || 0) + 1
      const next = {
        failures,
        until: failures >= MAX_FAILURES ? Date.now() + LOCKOUT_MS : 0,
      }
      writeLockout(next)
      setError(
        next.until
          ? `Too many failed attempts. Locked for ${LOCKOUT_MS / 1000}s.`
          : err?.message || 'Login failed',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
        <p className="chip">HealthTrack RHU PILA</p>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to continue to your dashboard.</p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className="field-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
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
          />

          {error && <p className="error-banner">{error}</p>}
          {profileError && !error ? <p className="error-banner">{profileError}</p> : null}

          <button type="submit" className="primary-btn" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
