import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

import { STORAGE_SERVICE_ID, STORAGE_SERVICE_NAME } from '../lib/patientServiceEnrollment'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signIn, resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState(() => (location.state?.verified ? 'Account verified. You can now sign in.' : ''))
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      const hasSelectedService =
        Boolean(sessionStorage.getItem(STORAGE_SERVICE_ID)) || Boolean(sessionStorage.getItem(STORAGE_SERVICE_NAME))
      navigate(hasSelectedService ? '/dashboard/queue' : '/dashboard', { replace: true })
    }
  }, [navigate, user])

  const canReset = useMemo(() => email.trim().length > 3, [email])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    setInfo('')
    try {
      const result = await signIn({ email: email.trim(), password })
      if (!result.ok) {
        if (result.needsVerification) {
          const verifyPayload = {
            userId: result.userId || null,
            email: result.email || email.trim(),
            phone: '',
          }
          sessionStorage.setItem('healthtrack_pending_verify', JSON.stringify(verifyPayload))
          navigate('/verify', { state: verifyPayload })
          return
        }
        const message = result.error || 'Failed to sign in'
        const needsVerify =
          /email not confirmed/i.test(message) ||
          /email_not_confirmed/i.test(message) ||
          /not verified/i.test(message)
        if (needsVerify) {
          sessionStorage.setItem(
            'healthtrack_pending_verify',
            JSON.stringify({ userId: null, email: email.trim(), phone: '' }),
          )
          navigate('/verify', { state: { email: email.trim() } })
          return
        }
        setError(message)
        return
      }
      return
    } catch (e) {
      setError(e?.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    setError('')
    setInfo('')
    if (!canReset) {
      setError('Enter your email first to reset your password.')
      return
    }
    setLoading(true)
    const result = await resetPassword(email.trim())
    if (!result.ok) {
      setError(result.error || 'Failed to send reset email.')
      setLoading(false)
      return
    }
    setInfo('Password reset email sent. Please check your inbox.')
    setLoading(false)
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
          <p className="chip">HealthTrack Rural Health Unit of Pila</p>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-subtitle">Sign in to access your patient portal.</p>

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
                autoComplete="email"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="password">
                Password
              </label>
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
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  <svg viewBox="0 0 24 24" className="password-toggle-icon" fill="none" stroke="currentColor" strokeWidth="2">
                    {showPassword ? (
                      <>
                        <path d="M3 3l18 18" />
                        <path d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58" />
                        <path d="M9.88 5.09A9.53 9.53 0 0112 5c7 0 10 7 10 7a18.44 18.44 0 01-5.17 5.94" />
                        <path d="M6.61 6.61A18.44 18.44 0 002 12s3 7 10 7a9.53 9.53 0 004.11-.88" />
                      </>
                    ) : (
                      <>
                        <path d="M1.5 12s3.5-7.5 10.5-7.5S22.5 12 22.5 12s-3.5 7.5-10.5 7.5S1.5 12 1.5 12z" />
                        <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {error && <p className="error-banner">{error}</p>}
            {info && <p className="info-banner">{info}</p>}

            <button type="submit" className="primary-btn" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in'}
            </button>

            <button type="button" className="secondary-btn" disabled={loading} onClick={handleResetPassword}>
              Forgot password?
            </button>
          </form>

          <p className="auth-footer">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="auth-link">
              Register here
            </Link>
          </p>
        </section>
      </div>
    </main>
  )
}
