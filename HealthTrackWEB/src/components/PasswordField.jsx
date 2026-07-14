import { useState } from 'react'

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="password-toggle-icon">
      <path
        fill="currentColor"
        d="M12 5c5.52 0 9.88 4.7 10 6.83a1 1 0 0 1 0 .34C21.88 14.3 17.52 19 12 19S2.12 14.3 2 12.17a1 1 0 0 1 0-.34C2.12 9.7 6.48 5 12 5Zm0 2C7.73 7 4.1 10.46 4 12c.1 1.54 3.73 5 8 5s7.9-3.46 8-5c-.1-1.54-3.73-5-8-5Zm0 2.5A2.5 2.5 0 1 1 9.5 12 2.5 2.5 0 0 1 12 9.5Z"
      />
    </svg>
  )
}

function EyeSlashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="password-toggle-icon">
      <path
        fill="currentColor"
        d="M4.29 3.29a1 1 0 0 0-1.42 1.42l2.07 2.07C3.06 8.28 2.1 10.16 2 11.83a1 1 0 0 0 0 .34C2.12 14.3 6.48 19 12 19c2 0 3.82-.62 5.36-1.62l1.93 1.92a1 1 0 1 0 1.42-1.42ZM12 17c-4.27 0-7.9-3.46-8-5 .07-1.03 1.74-3.08 4.24-4.2l1.6 1.6a2.5 2.5 0 0 0 3.26 3.26l2.79 2.79A7.85 7.85 0 0 1 12 17Zm0-10c4.27 0 7.9 3.46 8 5-.05.84-1.17 2.29-2.94 3.4l-1.48-1.48A3.98 3.98 0 0 0 16 12a4 4 0 0 0-4-4c-.67 0-1.3.16-1.85.42L8.6 6.87A9.94 9.94 0 0 1 12 7Z"
      />
    </svg>
  )
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  required = false,
  autoComplete,
  showCriteria = false,
}) {
  const [showPassword, setShowPassword] = useState(false)

  const hasMinLength = value?.length >= 6
  const hasUppercase = /[A-Z]/.test(value || '')
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>[\]\\/~`_+=-]/.test(value || '')

  return (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <div className="password-input-wrap">
        <input
          id={id}
          type={showPassword ? 'text' : 'password'}
          required={required}
          className="field-input password-input"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="password-toggle-btn"
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          aria-pressed={showPassword}
        >
          {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
        </button>
      </div>

      {showCriteria && value && value.length > 0 && (
        <ul className="pw-criteria mt-2 text-sm">
          <li className={hasMinLength ? 'text-teal-700' : 'text-rose-600'}>
            {hasMinLength ? '✓' : '✕'} Minimum 6 characters
          </li>
          <li className={hasUppercase ? 'text-teal-700' : 'text-rose-600'}>
            {hasUppercase ? '✓' : '✕'} At least one uppercase letter
          </li>
          <li className={hasSpecial ? 'text-teal-700' : 'text-rose-600'}>
            {hasSpecial ? '✓' : '✕'} At least one special character
          </li>
        </ul>
      )}
    </div>
  )
}
