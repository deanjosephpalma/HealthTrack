export default function GoogleContinueButton({ onClick, busy = false, label = 'Continue using Google Account' }) {
  return (
    <button type="button" className="google-continue-btn" onClick={onClick} disabled={busy}>
      <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.46c-.28 1.41-1.12 2.6-2.38 3.4v2.82h3.84c2.25-2.07 3.57-5.12 3.57-8.25z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.84-2.82c-1.07.72-2.44 1.15-4.11 1.15-3.16 0-5.84-2.13-6.8-5H1.25v2.91C3.23 21.3 7.31 24 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.2 14.43A7.2 7.2 0 014.82 12c0-.84.15-1.66.38-2.43V6.66H1.25A11.96 11.96 0 000 12c0 1.94.46 3.77 1.25 5.34l3.95-2.91z"
        />
        <path
          fill="#EA4335"
          d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.41-3.41C17.95 1.19 15.24 0 12 0 7.31 0 3.23 2.7 1.25 6.66l3.95 2.91c.96-2.87 3.64-4.8 6.8-4.8z"
        />
      </svg>
      <span>{busy ? 'Connecting…' : label}</span>
    </button>
  )
}

export function AuthBrandMark() {
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
