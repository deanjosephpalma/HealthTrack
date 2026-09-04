import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { confirmPasswordReset } from '../lib/apiClient'

const uppercaseRegex = /[A-Z]/
const specialCharRegex = /[^A-Za-z0-9]/

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = (params.get('token') || '').trim()
  const emailFromLink = (params.get('email') || '').trim()

  const [email, setEmail] = useState(emailFromLink)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  const linkValid = useMemo(() => token.length >= 32 && emailFromLink.length > 3, [token, emailFromLink])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setInfo('')

    if (!linkValid) {
      setError('This reset link is incomplete. Please request a new password reset from the login page.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (!uppercaseRegex.test(password)) {
      setError('Password must include at least one uppercase letter.')
      return
    }
    if (!specialCharRegex.test(password)) {
      setError('Password must include at least one special character.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const result = await confirmPasswordReset({
        email: email.trim(),
        token,
        password,
        passwordConfirmation: confirmPassword,
      })
      if (!result?.ok) {
        setError(result?.error || 'Failed to reset password.')
        return
      }
      setInfo(result.message || 'Password updated. Redirecting to login…')
      window.setTimeout(() => {
        navigate('/login', {
          replace: true,
          state: { message: 'Password updated successfully. Please sign in with your new password.', email: email.trim() },
        })
      }, 900)
    } catch (e) {
      setError(e?.message || 'Failed to reset password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-page-inner">
        <Link to="/login" className="back-home-link">
          <span className="back-home-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </span>
          <span>Back to login</span>
        </Link>

        <section className="auth-card login-card">
          <p className="chip">HealthTrack RHU Pila</p>
          <h1 className="auth-title">Set a new password</h1>
          <p className="auth-subtitle">Choose a strong password for your patient portal account.</p>

          {!linkValid ? (
            <div className="space-y-4">
              <p className="error-banner">
                This reset link is invalid or incomplete. Open the latest email link, or request a new reset from login.
              </p>
              <Link to="/login" className="primary-btn inline-flex justify-center no-underline">
                Go to login
              </Link>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="field-label" htmlFor="reset-email">
                  Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  className="field-input bg-slate-50 text-slate-600"
                  value={email}
                  readOnly
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="reset-password">
                  New password
                </label>
                <div className="password-input-wrap">
                  <input
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="field-input password-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a new password"
                    autoComplete="new-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={loading}
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
                {password.length > 0 ? (
                  <ul className="pw-criteria mt-2 text-sm">
                    <li className={password.length >= 6 ? 'text-teal-700' : 'text-rose-600'}>
                      {password.length >= 6 ? '✓' : '✕'} Minimum 6 characters
                    </li>
                    <li className={uppercaseRegex.test(password) ? 'text-teal-700' : 'text-rose-600'}>
                      {uppercaseRegex.test(password) ? '✓' : '✕'} At least one uppercase letter
                    </li>
                    <li className={specialCharRegex.test(password) ? 'text-teal-700' : 'text-rose-600'}>
                      {specialCharRegex.test(password) ? '✓' : '✕'} At least one special character
                    </li>
                  </ul>
                ) : null}
              </div>

              <div>
                <label className="field-label" htmlFor="reset-confirm">
                  Confirm new password
                </label>
                <input
                  id="reset-confirm"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="field-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  disabled={loading}
                />
              </div>

              {error ? <p className="error-banner">{error}</p> : null}
              {info ? <p className="info-banner">{info}</p> : null}

              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
