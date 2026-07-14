import { supabase } from './supabaseClient'
import { apiFetch } from './apiClient'

export async function sendVerificationCode({ userId, destination }) {
  if (!userId || !destination) {
    return { ok: false, error: 'Missing account email. Please register again.' }
  }

  try {
    const payload = await apiFetch('/verification/send', {
      method: 'POST',
      body: { user_id: userId, email: destination },
    })
    if (!payload?.ok) {
      return { ok: false, error: payload?.error || 'Email API error' }
    }
    return { ok: true, isOtp: false }
  } catch (err) {
    return { ok: false, error: err?.message || 'Verification service unreachable' }
  }
}

export async function verifyEmailCode({ userId, email, code, isOtp }) {
  if (isOtp) {
    const { error: signupOtpError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'signup',
    })

    if (!signupOtpError) return { ok: true }

    const { error: emailOtpError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    })

    if (!emailOtpError) return { ok: true }

    return { ok: false, error: 'Invalid or expired code. Request a new code and try again.' }
  }

  try {
    const payload = await apiFetch('/verification/verify', {
      method: 'POST',
      body: { user_id: userId, code },
    })
    if (payload?.ok) return { ok: true }
    return { ok: false, error: payload?.error || 'Invalid or expired code.' }
  } catch (err) {
    return { ok: false, error: err?.message || 'Verification server unreachable' }
  }
}
