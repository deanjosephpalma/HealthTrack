import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { AuthBrandMark } from '../components/GoogleContinueButton'
import { fetchPatientAddressOptions } from '../lib/apiClient'
import { PWD_DISABILITY_TYPES } from '../lib/pwdDisabilityTypes'

const phoneRegex = /^(09\d{9}|\+639\d{9})$/
const uppercaseRegex = /[A-Z]/
const specialCharRegex = /[^A-Za-z0-9]/

export default function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [isPwd, setIsPwd] = useState(false)
  const [pwdSpecify, setPwdSpecify] = useState('')
  const [pwdOtherDetail, setPwdOtherDetail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [agree, setAgree] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [policyOpen, setPolicyOpen] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState(null)

  const [province] = useState('Laguna')
  const [municipalityMode, setMunicipalityMode] = useState('Pila')
  const [municipalityOther, setMunicipalityOther] = useState('')
  const [barangay, setBarangay] = useState('')
  const [houseNoPurok, setHouseNoPurok] = useState('')
  const [pilaBarangays, setPilaBarangays] = useState([])
  const [municipalities, setMunicipalities] = useState([
    { value: 'Pila', label: 'Pila' },
    { value: 'Others', label: 'Others (not from Pila)' },
  ])

  const normalizedPhone = useMemo(() => phone.trim().replace(/\s+/g, ''), [phone])
  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await fetchPatientAddressOptions()
        if (cancelled || !data?.ok) return
        if (Array.isArray(data.municipalities) && data.municipalities.length) {
          setMunicipalities(data.municipalities)
        }
        if (Array.isArray(data.pila_barangays) && data.pila_barangays.length) {
          setPilaBarangays(data.pila_barangays.map((b) => b.value || b.label || b).filter(Boolean))
        }
      } catch {
        setPilaBarangays([
          'Aplaya', 'Bagong Pook', 'Bukal', 'Bulilan Norte', 'Bulilan Sur', 'Concepcion',
          'Labuin', 'Linga', 'Masico', 'Mojon', 'Pansol', 'Pinagbayanan', 'San Antonio',
          'San Miguel', 'Santa Clara Norte', 'Santa Clara Sur', 'Tubuan',
        ])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setBarangay('')
    if (municipalityMode === 'Pila') setMunicipalityOther('')
  }, [municipalityMode])

  const policyContent = useMemo(() => {
    const sharedIntro = (
      <p className="text-sm text-slate-700">
        HealthTrack RHU Pila Patient Portal ay ginagamit para sa queue / Get in line, service status, at pag-view ng
        medical records. Sa paggamit mo ng portal, pumapayag ka sa mga kondisyon sa ibaba.
      </p>
    )
    return {
      terms: (
        <div className="space-y-4">
          {sharedIntro}
          <p className="text-sm text-slate-700">Panatilihing confidential ang username at password. Huwag i-share ang login details.</p>
        </div>
      ),
      privacy: (
        <div className="space-y-4">
          {sharedIntro}
          <p className="text-sm text-slate-700">
            Phone number at address ay ginagamit para sa patient identification at RHU notifications (SMS).
          </p>
        </div>
      ),
    }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!firstName.trim() || !lastName.trim()) {
      setError('Enter your first and last name.')
      return
    }
    if (!phoneRegex.test(normalizedPhone)) {
      setError('Phone must be 09XXXXXXXXX or +639XXXXXXXXX.')
      return
    }
    if (!birthdate) {
      setError('Birthdate is required.')
      return
    }
    if (!houseNoPurok.trim()) {
      setError('House No. / Street / Purok is required.')
      return
    }
    if (municipalityMode === 'Pila' && !barangay) {
      setError('Select your barangay in Pila.')
      return
    }
    if (municipalityMode === 'Others') {
      if (!municipalityOther.trim()) {
        setError('Enter your municipality/city.')
        return
      }
      if (!barangay.trim()) {
        setError('Enter your barangay.')
        return
      }
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
    if (!agree) {
      setError('You must agree to the terms to continue.')
      return
    }
    if (isPwd) {
      if (!pwdSpecify.trim()) {
        setError('Please select a PWD / disability type.')
        return
      }
      if (pwdSpecify === 'Other' && !pwdOtherDetail.trim()) {
        setError('Please specify the disability details.')
        return
      }
    }

    setLoading(true)
    const disabilityValue =
      isPwd
        ? pwdSpecify === 'Other'
          ? `Other: ${pwdOtherDetail.trim()}`
          : pwdSpecify.trim()
        : null
    const result = await signUp({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: normalizedPhone,
      password,
      passwordConfirmation: confirmPassword,
      birthdate,
      disability: disabilityValue,
      houseNoPurok: houseNoPurok.trim(),
      municipalityMode,
      municipality: municipalityMode === 'Others' ? municipalityOther.trim() : 'Pila',
      barangay: barangay.trim(),
      province,
    })
    setLoading(false)

    if (!result?.ok) {
      setError(typeof result?.error === 'string' ? result.error : 'Failed to create account. Please try again.')
      return
    }

    setCreated({
      username: result.username,
      phone: result.phone || normalizedPhone,
      message: result.message,
      smsSent: result.smsSent,
      smsMocked: result.smsMocked,
    })
  }

  if (created?.username) {
    return (
      <main className="login-page">
        <div className="login-page-inner">
          <section className="auth-card login-card">
            <header className="auth-card-header">
              <div className="auth-brand-row">
                <AuthBrandMark />
                <p className="chip mb-0!">Account ready</p>
              </div>
              <h1 className="auth-title">Registration successful</h1>
              <p className="auth-subtitle">Save your username — you will use it to sign in.</p>
            </header>

            <div className="rounded-2xl border border-teal-200 bg-teal-50/80 px-4 py-5 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Your username</p>
              <p className="mt-2 font-mono text-4xl font-bold tracking-[0.2em] text-teal-950">{created.username}</p>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate-600">{created.message}</p>

            <button
              type="button"
              className="primary-btn mt-5 w-full"
              onClick={() =>
                navigate('/login', {
                  replace: true,
                  state: {
                    registered: true,
                    username: created.username,
                    message: `Account created. Sign in with username ${created.username}.`,
                  },
                })
              }
            >
              Continue to sign in
            </button>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="login-page">
      <div className="login-page-inner login-page-inner-wide">
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
            <h1 className="auth-title">Create your account</h1>
            <p className="auth-subtitle">Register with your phone number. We’ll assign a username like 0001.</p>
            <p className="auth-hint">Your username will be texted to your phone after registration.</p>
          </header>

          <form className="auth-form" onSubmit={(e) => void handleSubmit(e)}>
            <div className="auth-field-group">
              <p className="auth-section-label">Personal details</p>
              <div className="simple-grid">
                <div>
                  <label className="field-label" htmlFor="firstName">First Name</label>
                  <input id="firstName" required className="field-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
                </div>
                <div>
                  <label className="field-label" htmlFor="lastName">Last Name</label>
                  <input id="lastName" required className="field-input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
                </div>
              </div>

              <div>
                <label className="field-label" htmlFor="phone">Phone Number</label>
                <input
                  id="phone"
                  type="tel"
                  required
                  className="field-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09XXXXXXXXX"
                />
              </div>

              <div className="simple-grid">
                <div>
                  <label className="field-label" htmlFor="birthdate">Birthdate</label>
                  <input
                    id="birthdate"
                    type="date"
                    required
                    className="field-input"
                    value={birthdate}
                    onChange={(e) => setBirthdate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                  />
                  <p className="mt-1 text-xs text-slate-500">Ages 60+ join the priority line (first-come, first-served among priority).</p>
                </div>
                <div>
                  <label className="field-label" htmlFor="isPwd">PWD?</label>
                  <select
                    id="isPwd"
                    className="field-input"
                    value={isPwd ? 'yes' : 'no'}
                    onChange={(e) => {
                      const yes = e.target.value === 'yes'
                      setIsPwd(yes)
                      if (!yes) {
                        setPwdSpecify('')
                        setPwdOtherDetail('')
                      }
                    }}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              </div>

              {isPwd ? (
                <div className="space-y-3">
                  <div>
                    <label className="field-label" htmlFor="pwdSpecify">PWD / Disability specification</label>
                    <select
                      id="pwdSpecify"
                      required
                      className="field-input"
                      value={pwdSpecify}
                      onChange={(e) => {
                        const value = e.target.value
                        setPwdSpecify(value)
                        if (value !== 'Other') setPwdOtherDetail('')
                      }}
                    >
                      <option value="" disabled>
                        Select disability type
                      </option>
                      {PWD_DISABILITY_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  {pwdSpecify === 'Other' ? (
                    <div>
                      <label className="field-label" htmlFor="pwdOtherDetail">Please specify</label>
                      <input
                        id="pwdOtherDetail"
                        required
                        className="field-input"
                        value={pwdOtherDetail}
                        onChange={(e) => setPwdOtherDetail(e.target.value)}
                        placeholder="Describe the disability"
                      />
                    </div>
                  ) : null}
                  <p className="text-xs text-slate-500">PWD patients join the priority line with Senior 60+ (first-come, first-served within that line).</p>
                </div>
              ) : null}
            </div>

            <div className="auth-field-group">
              <p className="auth-section-label">Address (Laguna)</p>
              <div>
                <label className="field-label" htmlFor="province">Province</label>
                <input id="province" className="field-input bg-slate-50 text-slate-500" value={province} readOnly />
              </div>

              <div>
                <label className="field-label" htmlFor="municipalityMode">Municipality / City</label>
                <select
                  id="municipalityMode"
                  className="field-input"
                  value={municipalityMode}
                  onChange={(e) => setMunicipalityMode(e.target.value)}
                >
                  {municipalities.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              {municipalityMode === 'Others' ? (
                <div>
                  <label className="field-label" htmlFor="municipalityOther">Municipality / City name</label>
                  <input
                    id="municipalityOther"
                    required
                    className="field-input"
                    value={municipalityOther}
                    onChange={(e) => setMunicipalityOther(e.target.value)}
                    placeholder="e.g. Santa Cruz, Calamba"
                  />
                </div>
              ) : null}

              <div>
                <label className="field-label" htmlFor="barangay">Barangay</label>
                {municipalityMode === 'Pila' ? (
                  <select
                    id="barangay"
                    required
                    className="field-input"
                    value={barangay}
                    onChange={(e) => setBarangay(e.target.value)}
                  >
                    <option value="">Select barangay</option>
                    {pilaBarangays.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="barangay"
                    required
                    className="field-input"
                    value={barangay}
                    onChange={(e) => setBarangay(e.target.value)}
                    placeholder="Enter barangay"
                  />
                )}
              </div>

              <div>
                <label className="field-label" htmlFor="houseNoPurok">House No. / Street / Purok</label>
                <input
                  id="houseNoPurok"
                  required
                  className="field-input"
                  value={houseNoPurok}
                  onChange={(e) => setHouseNoPurok(e.target.value)}
                  placeholder="e.g. Purok 2, Sitio…"
                />
              </div>
            </div>

            <div className="auth-field-group">
              <p className="auth-section-label">Password</p>
              <div>
                <label className="field-label" htmlFor="password">Password</label>
                <div className="password-input-wrap">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="field-input password-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button type="button" className="password-toggle-btn" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password">
                    <svg viewBox="0 0 24 24" className="password-toggle-icon" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1.5 12s3.5-7.5 10.5-7.5S22.5 12 22.5 12s-3.5 7.5-10.5 7.5S1.5 12 1.5 12z" />
                      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                    </svg>
                  </button>
                </div>
                {password.length > 0 && (
                  <ul className="pw-criteria mt-2 text-sm">
                    <li className={password.length >= 6 ? 'text-teal-700' : 'text-rose-600'}>{password.length >= 6 ? '✓' : '✕'} Minimum 6 characters</li>
                    <li className={uppercaseRegex.test(password) ? 'text-teal-700' : 'text-rose-600'}>{uppercaseRegex.test(password) ? '✓' : '✕'} Uppercase letter</li>
                    <li className={specialCharRegex.test(password) ? 'text-teal-700' : 'text-rose-600'}>{specialCharRegex.test(password) ? '✓' : '✕'} Special character</li>
                  </ul>
                )}
              </div>
              <div>
                <label className="field-label" htmlFor="confirmPassword">Confirm Password</label>
                <div className="password-input-wrap">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    className="field-input password-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    aria-invalid={passwordMismatch}
                    aria-describedby={passwordMismatch ? 'confirm-password-error' : undefined}
                  />
                  <button type="button" className="password-toggle-btn" onClick={() => setShowConfirmPassword((v) => !v)} aria-label="Toggle confirm password">
                    <svg viewBox="0 0 24 24" className="password-toggle-icon" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1.5 12s3.5-7.5 10.5-7.5S22.5 12 22.5 12s-3.5 7.5-10.5 7.5S1.5 12 1.5 12z" />
                      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
                    </svg>
                  </button>
                </div>
                {passwordMismatch ? (
                  <p id="confirm-password-error" className="mt-1.5 text-sm font-semibold text-rose-600" role="alert">
                    Password Not Match
                  </p>
                ) : null}
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5 rounded border-slate-300 text-teal-700" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>
                I agree to the{' '}
                <button type="button" className="font-semibold text-teal-700" onClick={() => setPolicyOpen('terms')}>Terms of Service</button>
                {' '}and{' '}
                <button type="button" className="font-semibold text-teal-700" onClick={() => setPolicyOpen('privacy')}>Privacy Policy</button>
              </span>
            </label>

            {error ? <p className="error-banner">{error}</p> : null}

            <div className="auth-actions">
              <button type="submit" className="primary-btn" disabled={loading}>
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>

          <p className="auth-footer text-center">
            Already have an account? <Link to="/login" className="auth-link">Sign in</Link>
          </p>
        </section>
      </div>

      {policyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 bg-slate-950/40" aria-label="Close" onClick={() => setPolicyOpen(null)} />
          <section className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-bold text-slate-900">{policyOpen === 'terms' ? 'Terms of Service' : 'Privacy Policy'}</h2>
              <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold" onClick={() => setPolicyOpen(null)}>Close</button>
            </header>
            <div className="max-h-[60vh] overflow-auto px-6 py-5">
              {policyOpen === 'terms' ? policyContent.terms : policyContent.privacy}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
