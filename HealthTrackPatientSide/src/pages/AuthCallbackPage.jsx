import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabaseClient'

export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const { completeOAuthSignIn } = useAuth()
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // Ensure PKCE code from ?code= is exchanged before bridging to Laravel.
        const params = new URLSearchParams(window.location.search)
        const code = params.get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            // detectSessionInUrl may have already consumed the code
            const { data } = await supabase.auth.getSession()
            if (!data?.session) throw exchangeError
          }
        }

        const result = await completeOAuthSignIn()
        if (cancelled) return
        if (!result?.ok) {
          setError(result?.error || 'Google sign-in failed.')
          return
        }
        if (result.needsVerification) {
          navigate('/verify', {
            replace: true,
            state: { userId: result.userId, email: result.email },
          })
          return
        }
        navigate('/dashboard', { replace: true })
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Google sign-in failed.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [completeOAuthSignIn, navigate])

  return (
    <main className="login-page">
      <div className="login-page-inner">
        <section className="auth-card login-card">
          <p className="chip">HealthTrack RHU PILA</p>
          <h1 className="auth-title">Finishing Google sign-in…</h1>
          {error ? (
            <>
              <p className="error-banner">{error}</p>
              <Link to="/login" className="primary-btn inline-flex justify-center no-underline">
                Back to login
              </Link>
            </>
          ) : (
            <p className="auth-subtitle">Please wait while we secure your patient session.</p>
          )}
        </section>
      </div>
    </main>
  )
}
