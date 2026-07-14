import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { sendVerificationCode, verifyEmailCode } from '../lib/sendVerificationCode'
import { supabase } from '../lib/supabaseClient'

const STORAGE_KEY = 'healthtrack_pending_verify'

function readPendingVerify() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
}

function maskEmail(value) {
  const email = (value ?? '').toString().trim()
  const at = email.indexOf('@')
  if (at <= 1) return email
  const name = email.slice(0, at)
  const domain = email.slice(at)
  const visible = name.slice(0, Math.min(2, name.length))
  return `${visible}${'•'.repeat(Math.max(1, name.length - visible.length))}${domain}`
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />
      <path d="M9.5 12.5l2 2 3.5-4" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <path d="M4 6h16v12H4z" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  )
}

export default function VerifyPage() {
  const { state } = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const pending = useMemo(() => {
    const stored = readPendingVerify()
    return {
      userId: state?.userId || stored?.userId || user?.id || null,
      email: state?.email || stored?.email || user?.email || '',
    }
  }, [state?.userId, state?.email, user?.id, user?.email])

  const userId = pending.userId
  const email = pending.email

  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [isOtpMode, setIsOtpMode] = useState(false)
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    if (userId && email) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, email }))
    }
  }, [email, userId])

  useEffect(() => {
    if (!userId && !email) {
      navigate('/register', { replace: true })
    }
  }, [email, navigate, userId])

  function clearMessages() {
    setInfo('')
    setError('')
  }

  function finishVerification() {
    sessionStorage.removeItem(STORAGE_KEY)
    void supabase.auth.signOut().finally(() => {
      navigate('/login', { replace: true, state: { verified: true } })
    })
  }

  async function sendCode() {
    clearMessages()
    setSending(true)

    if (!userId) {
      setError('Missing account reference. Please register again.')
      setSending(false)
      return
    }

    const result = await sendVerificationCode({ userId, destination: email })

    if (result.ok) {
      setCodeSent(true)
      setIsOtpMode(result.isOtp === true)
      setInfo(`A 6-digit code was sent to ${maskEmail(email)}. Check your inbox and spam folder. It expires in 10 minutes.`)
    } else {
      setError(result.error || 'Could not send verification email. Please try again.')
    }

    setSending(false)
  }

  async function verifyCode(event) {
    event?.preventDefault?.()
    clearMessages()
    setVerifying(true)

    if (!userId) {
      setError('Missing account reference. Please register again.')
      setVerifying(false)
      return
    }

    const code = codeInput.replace(/\D/g, '').trim()
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code.')
      setVerifying(false)
      return
    }

    const result = await verifyEmailCode({ userId, email, code, isOtp: isOtpMode })

    if (result.ok) {
      setInfo('Email verified! Redirecting to login…')
      setTimeout(finishVerification, 1200)
      return
    }

    setError(result.error || 'Invalid or expired code. Request a new code and try again.')
    setVerifying(false)
  }

  if (!userId && !email) return null

  return (
    <main className="login-page">
      <div className="login-page-inner verify-page-inner">
        <Link to="/register" className="back-home-link">
          <span className="back-home-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </span>
          <span>Back to register</span>
        </Link>

        <section className="auth-card login-card verify-card">
          <p className="chip">HealthTrack Rural Health Unit of Pila</p>

          <div className="verify-hero">
            <span className="verify-hero-icon" aria-hidden="true">
              <ShieldIcon />
            </span>
            <div>
              <h1 className="auth-title mb-1!">Verify your account</h1>
              <p className="auth-subtitle mb-0!">
                Confirm your email to activate your patient portal.
              </p>
            </div>
          </div>

          <ol className="verify-steps" aria-label="Verification progress">
            <li className="verify-step verify-step-active">
              <span className="verify-step-num">1</span>
              <span>Email verification</span>
              <span className="verify-step-badge">Required</span>
            </li>
          </ol>

          {error ? <p className="error-banner verify-banner">{error}</p> : null}
          {info ? <p className="info-banner verify-banner">{info}</p> : null}

          <div className="verify-panel">
            <div className="verify-panel-head">
              <span className="verify-panel-icon verify-panel-icon-email">
                <MailIcon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="verify-panel-label">Email address</p>
                <p className="verify-panel-value" title={email}>
                  {maskEmail(email)}
                </p>
              </div>
            </div>

            {!codeSent ? (
              <button
                type="button"
                className="primary-btn verify-action-btn"
                onClick={() => void sendCode()}
                disabled={sending}
              >
                {sending ? 'Sending code…' : 'Send verification code'}
              </button>
            ) : (
              <form className="verify-code-form" onSubmit={(e) => void verifyCode(e)}>
                <label className="field-label" htmlFor="otp-code">
                  6-digit verification code
                </label>
                <input
                  id="otp-code"
                  className="verify-code-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="• • • • • •"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                />
                <p className="verify-code-hint">
                  Code expires in 10 minutes. Check your inbox and spam folder.
                </p>
                <button
                  type="submit"
                  className="primary-btn verify-action-btn"
                  disabled={verifying || codeInput.length < 6}
                >
                  {verifying ? 'Verifying…' : 'Confirm & activate account'}
                </button>
                <button
                  type="button"
                  className="verify-text-btn"
                  onClick={() => void sendCode()}
                  disabled={sending}
                >
                  {sending ? 'Sending…' : 'Resend code'}
                </button>
              </form>
            )}
          </div>

          <p className="auth-footer verify-footer">
            Already verified?{' '}
            <Link to="/login" className="auth-link">
              Sign in
            </Link>
          </p>
        </section>
      </div>
    </main>
  )
}
