import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/useAuth'

const phoneRegex = /^(09\d{9}|\+639\d{9})$/
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const uppercaseRegex = /[A-Z]/
const specialCharRegex = /[^A-Za-z0-9]/

export default function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agree, setAgree] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailChecking, setEmailChecking] = useState(false)
  const [emailWarning, setEmailWarning] = useState('')
  const [nameChecking, setNameChecking] = useState(false)
  const [nameWarning, setNameWarning] = useState('')

  const normalizedPhone = useMemo(() => phone.trim().replace(/\s+/g, ''), [phone])
  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email])
  const normalizedFullName = useMemo(() => `${firstName.trim()} ${lastName.trim()}`.trim().toLowerCase(), [firstName, lastName])

  const policyContent = useMemo(() => {
    const sharedIntro = (
      <>
        <p className="text-sm text-slate-700">
          HealthTrack RHU Pila Patient Portal ay ginagamit para sa appointment requests at pag-view ng medical records na na-encode ng
          Rural Health Unit of Pila, Laguna. Sa paggamit mo ng portal, pumapayag ka sa mga kondisyon sa ibaba.
        </p>
      </>
    )

    const terms = (
      <div className="space-y-4">
        {sharedIntro}
        <div>
          <p className="text-sm font-semibold text-slate-900">1) Eligibility at Non-emergency Use</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
            <li>Ang portal ay para sa non-emergency health services. Kung emergency, tumawag sa 911 o pumunta sa pinakamalapit na ospital.</li>
            <li>Ikaw ang responsable sa paggamit ng account mo. Kung minor ang user, dapat may consent/assistance ng guardian.</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">2) Account at Security</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
            <li>Panatilihing confidential ang password. Huwag i-share ang login details.</li>
            <li>Ikaw ang responsable sa activity na nangyayari sa account mo.</li>
            <li>Kung may suspicion ng unauthorized access, i-update agad ang password at i-report sa RHU staff.</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">3) Accuracy ng Impormasyon</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
            <li>Siguraduhing tama ang email at phone number para sa announcements at appointment updates.</li>
            <li>Ang maling impormasyon ay maaaring mag-cause ng delays o errors sa appointment at records.</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">4) Appointments</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
            <li>Ang appointment request ay subject sa confirmation at availability ng RHU.</li>
            <li>Maaaring i-reschedule o i-cancel ng RHU ang appointment base sa capacity at policies.</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">5) Medical Records</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
            <li>Ang records na makikita mo ay read-only at galing sa consultation/appointment workflow.</li>
            <li>Kung may correction request, makipag-ugnayan sa RHU para sa proper verification.</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">6) Acceptable Use</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
            <li>Huwag gamitin ang portal sa fraudulent, abusive, o illegal activities.</li>
            <li>Hindi pinapayagan ang pag-attempt mag-access ng accounts/records ng ibang tao.</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">7) Changes</p>
          <p className="mt-2 text-sm text-slate-700">
            Maaaring i-update ang Terms of Service paminsan-minsan. Ang continued use ay nangangahulugan ng acceptance sa updates.
          </p>
        </div>
      </div>
    )

    const privacy = (
      <div className="space-y-4">
        {sharedIntro}
        <div>
          <p className="text-sm font-semibold text-slate-900">1) Data na Kinokolekta</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
            <li>Account data: pangalan, email, phone number.</li>
            <li>Appointment data: schedule, reason, status.</li>
            <li>Medical record data: impormasyon na na-encode ng RHU staff (hal. vitals, diagnosis, notes), kung applicable.</li>
            <li>Technical data: basic logs na kailangan para gumana ang authentication at security.</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">2) Purpose ng Processing</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
            <li>Para ma-manage ang patient accounts at appointment requests.</li>
            <li>Para maipakita sa patient ang medical records na ginawa sa appointment/consultation workflow.</li>
            <li>Para sa announcements at updates (kung enabled/needed) gamit ang contact details.</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">3) Sharing at Access</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
            <li>RHU staff (Admin/Doctor/Nurse) lang ang may access sa staff dashboard modules na kailangan sa serbisyo.</li>
            <li>Patient account can only view sariling records base sa account identity.</li>
            <li>Hindi ibinebenta ang personal data. Maaari lang i-share kung required ng batas o sa lawful requests.</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">4) Security</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
            <li>Ginagamit ang authentication at access controls para protektahan ang records.</li>
            <li>Walang system na 100% secure, pero nagsasagawa ng reasonable safeguards laban sa unauthorized access.</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">5) Retention</p>
          <p className="mt-2 text-sm text-slate-700">
            Ang records ay nire-retain base sa RHU policies at legal requirements. Maaaring kailanganin panatilihin kahit mag-request ng
            deletion kung required ng batas o medical record regulations.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">6) Your Rights</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700 space-y-1">
            <li>Humiling ng access/correction sa personal information subject sa verification.</li>
            <li>Humiling ng assistance kung may issues sa account o privacy concerns.</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">7) Contact</p>
          <p className="mt-2 text-sm text-slate-700">
            Para sa concerns tungkol sa data privacy o medical record corrections, makipag-ugnayan sa Rural Health Unit of Pila, Laguna.
          </p>
        </div>
      </div>
    )

    return { terms, privacy }
  }, [])

  useEffect(() => {
    let cancelled = false

    const checkEmail = async () => {
      if (!normalizedEmail) {
        setEmailWarning('')
        setEmailChecking(false)
        return
      }

      if (!emailRegex.test(normalizedEmail)) {
        setEmailWarning('')
        setEmailChecking(false)
        return
      }

      setEmailChecking(true)

      const { data, error: rpcError } = await supabase.rpc('is_email_registered', {
        p_email: normalizedEmail,
      })

      if (cancelled) return

      if (rpcError) {
        setEmailChecking(false)
        return
      }

      setEmailChecking(false)
      setEmailWarning(data ? 'Email already registered.' : '')
    }

    const timer = window.setTimeout(() => {
      checkEmail()
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [normalizedEmail])

  useEffect(() => {
    let cancelled = false

    const checkName = async () => {
      if (!normalizedFullName || !firstName.trim() || !lastName.trim()) {
        setNameWarning('')
        setNameChecking(false)
        return
      }

      setNameChecking(true)

      const { data, error: rpcError } = await supabase.rpc('is_name_registered', {
        p_name: normalizedFullName,
      })

      if (cancelled) return

      if (rpcError) {
        setNameChecking(false)
        return
      }

      setNameChecking(false)
      setNameWarning(data ? 'Name already registered.' : '')
    }

    const timer = window.setTimeout(() => {
      checkName()
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [normalizedFullName, firstName, lastName])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setInfo('')

    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required.')
      return
    }

    if (!email.trim() || !emailRegex.test(email.trim())) {
      setError('Enter a valid email address.')
      return
    }

    if (emailWarning) {
      setError(emailWarning)
      return
    }

    if (!normalizedPhone || !phoneRegex.test(normalizedPhone)) {
      setError('Phone number must be valid (09XXXXXXXXX or +639XXXXXXXXX).')
      return
    }

    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    if (nameWarning) {
      setError(nameWarning)
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

    if (!agree) {
      setError('You must agree to the terms to continue.')
      return
    }

    setLoading(true)
    const result = await signUp({
      email: email.trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: normalizedPhone,
    })
    setLoading(false)

    if (!result?.ok) {
      setError(typeof result?.error === 'string' ? result.error : 'Failed to create account. Please try again.')
      return
    }

    // Registration successful — go directly to dashboard
    sessionStorage.removeItem('healthtrack_pending_verify')
    navigate('/dashboard', { replace: true })
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
          <p className="chip">HealthTrack RHU PILA</p>
          <h1 className="auth-title">Create patient account</h1>
          <p className="auth-subtitle">Use a real email and phone number for announcements and updates.</p>
          <p className="text-sm text-slate-600">We’ll verify your account by email. Strong passwords are required.</p>

          <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="simple-grid">
            <div>
              <label className="field-label" htmlFor="firstName">
                First Name
              </label>
              <input
                id="firstName"
                type="text"
                required
                className={`field-input ${nameWarning ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200' : ''}`}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter first name"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="lastName">
                Last Name
              </label>
              <input
                id="lastName"
                type="text"
                required
                className={`field-input ${nameWarning ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200' : ''}`}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter last name"
              />
            </div>
            <div className="col-span-2 mt-1 flex items-center gap-2 text-sm">
              {nameChecking ? <span className="text-slate-500">Checking name…</span> : null}
              {nameWarning ? <span className="text-rose-600">⚠ {nameWarning}</span> : null}
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className={`field-input ${emailWarning ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200' : ''}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <div className="mt-1 flex items-center gap-2 text-sm">
              {emailChecking ? <span className="text-slate-500">Checking email…</span> : null}
              {emailWarning ? <span className="text-rose-600">⚠ {emailWarning}</span> : null}
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="phone">
              Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              required
              className="field-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09XXXXXXXXX or +639XXXXXXXXX"
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
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                autoComplete="new-password"
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
            {password.length > 0 && (
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
            )}
          </div>

          <div>
            <label className="field-label" htmlFor="confirmPassword">
              Confirm Password
            </label>
            <div className="password-input-wrap">
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                required
                className="field-input password-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowConfirmPassword((prev) => !prev)}
              >
                <svg viewBox="0 0 24 24" className="password-toggle-icon" fill="none" stroke="currentColor" strokeWidth="2">
                  {showConfirmPassword ? (
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

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              I agree to the{' '}
              <button
                type="button"
                className="font-semibold text-teal-700 transition hover:text-teal-600"
                onClick={() => setPolicyOpen('terms')}
              >
                Terms of Service
              </button>{' '}
              and{' '}
              <button
                type="button"
                className="font-semibold text-teal-700 transition hover:text-teal-600"
                onClick={() => setPolicyOpen('privacy')}
              >
                Privacy Policy
              </button>
            </span>
          </label>

          {error && <p className="error-banner">{error}</p>}
          {info && <p className="info-banner">{info}</p>}

          <button type="submit" className="primary-btn" disabled={loading}>
            {loading ? 'Creating...' : 'Register'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" className="auth-link">
            Login here
          </Link>
        </p>
        </section>
      </div>

      {policyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40"
            aria-label="Close policy"
            onClick={() => setPolicyOpen(null)}
          />
          <section className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
              <div>
                <p className="chip mb-0">{policyOpen === 'terms' ? 'Terms' : 'Privacy'}</p>
                <h2 className="mt-2 text-xl font-bold text-slate-900">
                  {policyOpen === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
                </h2>
              </div>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setPolicyOpen(null)}
              >
                Close
              </button>
            </header>
            <div className="max-h-[70vh] overflow-auto px-6 py-5">
              {policyOpen === 'terms' ? policyContent.terms : policyContent.privacy}
              <p className="mt-6 text-xs text-slate-500">
                Note: This content is provided for informational purposes for this system. For official RHU policies, refer to your local
                RHU guidelines.
              </p>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4">
              <button type="button" className="secondary-btn" onClick={() => setPolicyOpen(null)}>
                I Understand
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  )
}
