import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { AuthBrandMark } from '../components/GoogleContinueButton'
import { isPatientEmailVerified } from '../lib/patientEmailVerified'
import { STORAGE_SERVICE_ID, STORAGE_SERVICE_NAME } from '../lib/patientServiceEnrollment'
import {
  clearLoginLockout,
  getLockoutSecondsRemaining,
  readLoginLockout,
  registerLoginFailure,
  writeLoginLockout,
} from '../lib/loginLockout'

const LOCKOUT_KEY = 'ht_patient_login_lock'
const MAX_FAILURES = 3
const LOCKOUT_MS = 30_000

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signIn } = useAuth()
  const [username, setUsername] = useState(() => location.state?.username || '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState(() => {
    if (location.state?.message) return location.state.message
    if (location.state?.registered) return 'Account created. Sign in with your username and password.'
    return ''
  })
  const [loading, setLoading] = useState(false)
  const [lockRemaining, setLockRemaining] = useState(() => getLockoutSecondsRemaining(readLoginLockout(LOCKOUT_KEY).until))

  useEffect(() => {
    if (!user) return
    if (!isPatientEmailVerified(user)) {
      navigate('/verify', {
        replace: true,
        state: { userId: user.id, email: user.email },
      })
      return
    }
    const hasSelectedService =
      Boolean(sessionStorage.getItem(STORAGE_SERVICE_ID)) || Boolean(sessionStorage.getItem(STORAGE_SERVICE_NAME))
    navigate(hasSelectedService ? '/dashboard/queue' : '/dashboard', { replace: true })
  }, [navigate, user])

  useEffect(() => {
    const tick = () => {
      const until = readLoginLockout(LOCKOUT_KEY).until
      const secs = getLockoutSecondsRemaining(until)
      setLockRemaining(secs)
      if (secs <= 0 && until) clearLoginLockout(LOCKOUT_KEY)
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [])

  const lockedOut = lockRemaining > 0

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')

    const secsLeft = getLockoutSecondsRemaining(readLoginLockout(LOCKOUT_KEY).until)
    if (secsLeft > 0) {
      setError(`Too many failed attempts. Try again in ${secsLeft}s.`)
      setLockRemaining(secsLeft)
      setLoading(false)
      return
    }

    try {
      const result = await signIn({ username: username.trim(), password })
      if (!result.ok) {
        if (result.needsVerification) {
          clearLoginLockout(LOCKOUT_KEY)
          setLockRemaining(0)
          navigate('/verify', {
            replace: true,
            state: { userId: result.userId || null, email: result.email },
          })
          return
        }

        const message = result.error || 'Failed to sign in'
        if (/too many|429|rate limit/i.test(message)) {
          const forced = { failures: MAX_FAILURES, until: Date.now() + LOCKOUT_MS }
          writeLoginLockout(LOCKOUT_KEY, forced)
          setLockRemaining(getLockoutSecondsRemaining(forced.until))
          setError(`Too many failed attempts. Locked for ${LOCKOUT_MS / 1000}s.`)
          setPassword('')
          return
        }

        const next = registerLoginFailure(LOCKOUT_KEY, { maxFailures: MAX_FAILURES, lockoutMs: LOCKOUT_MS })
        setLockRemaining(getLockoutSecondsRemaining(next.until))
        setPassword('')
        if (next.locked) {
          setError(`Too many failed attempts. Locked for ${LOCKOUT_MS / 1000}s.`)
        } else {
          const left = next.remainingAttempts
          setError(`${message} ${left} attempt${left === 1 ? '' : 's'} left before a ${LOCKOUT_MS / 1000}s lock.`)
        }
        return
      }
      clearLoginLockout(LOCKOUT_KEY)
      setLockRemaining(0)
    } catch (e) {
      const next = registerLoginFailure(LOCKOUT_KEY, { maxFailures: MAX_FAILURES, lockoutMs: LOCKOUT_MS })
      setLockRemaining(getLockoutSecondsRemaining(next.until))
      setPassword('')
      if (next.locked) {
        setError(`Too many failed attempts. Locked for ${LOCKOUT_MS / 1000}s.`)
      } else {
        const left = next.remainingAttempts
        setError(`${e?.message || 'Failed to sign in'} ${left} attempt${left === 1 ? '' : 's'} left before a ${LOCKOUT_MS / 1000}s lock.`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-page-inner">
        <Link to="/" className="back-home-link">
          <span className="back-home-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </span>
          <span>Back to homepage</span>
        </Link>

        <section className="auth-card login-card">
          <header className="auth-card-header">
            <div className="auth-brand-row">
              <AuthBrandMark />
              <p className="chip mb-0!">Patient Portal</p>
            </div>
            <h1 className="auth-title">Welcome back</h1>
            <p className="auth-subtitle">Sign in with your username (e.g. 0001) and password.</p>
          </header>

          <form className="auth-form" onSubmit={(e) => void handleSubmit(e)}>
            <div>
              <label className="field-label" htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                required
                inputMode="numeric"
                className="field-input font-mono tracking-wider"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="0001"
                autoComplete="username"
                disabled={lockedOut || loading}
              />
            </div>

            <div>
              <label className="field-label" htmlFor="password">Password</label>
              <div className="password-input-wrap">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="field-input password-input"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={lockedOut || loading}
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={lockedOut || loading}
                >
                  <svg viewBox="0 0 24 24" className="password-toggle-icon" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1.5 12s3.5-7.5 10.5-7.5S22.5 12 22.5 12s-3.5 7.5-10.5 7.5S1.5 12 1.5 12z" />
                    <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                  </svg>
                </button>
              </div>
            </div>

            {lockedOut ? (
              <p className="error-banner" role="alert">
                Account temporarily locked after {MAX_FAILURES} failed attempts. Try again in{' '}
                <strong>{lockRemaining}s</strong>.
              </p>
            ) : null}
            {error && !lockedOut ? <p className="error-banner">{error}</p> : null}
            {info ? <p className="info-banner">{info}</p> : null}

            <div className="auth-actions">
              <button type="submit" className="primary-btn" disabled={loading || lockedOut}>
                {loading ? 'Signing in…' : lockedOut ? `Wait ${lockRemaining}s` : 'Sign in'}
              </button>
            </div>
          </form>

          <p className="auth-footer text-center">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="auth-link">Create one</Link>
          </p>
        </section>
      </div>
    </main>
  )
}
