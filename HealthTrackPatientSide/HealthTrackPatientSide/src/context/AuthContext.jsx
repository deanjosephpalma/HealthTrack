import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  applySupabaseSession,
  clearPatientOffline,
  ensurePatientOfflineNamespace,
  prepareFreshPatientSession,
  supabase,
} from '../lib/supabaseClient'
import { fetchAuthMe, loginWithPassword, logoutSession, refreshAuthSession, requestPasswordReset, bridgeAuthSession } from '../lib/apiClient'

import { AuthContext, buildPatient } from './AuthContextObject'
import {
  enrollFromSessionSelection,
  fetchActiveEnrollment,
} from '../lib/patientServiceEnrollment'
import { isPatientEmailVerified } from '../lib/patientEmailVerified'

const STAFF_ROLES = new Set(['Admin', 'Doctor', 'Nurse', 'BHW', 'Volunteer'])
const INVALID_CREDENTIALS_MESSAGE = 'Invalid login credentials'
const SIGN_IN_TIMEOUT_MS = 15000

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [patient, setPatient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [enrollment, setEnrollment] = useState(null)

  const validatePatientUser = useCallback(async (nextUser) => {
    if (!nextUser) {
      return { ok: true }
    }

    const meta = nextUser.user_metadata ?? {}
    const metaApp = (meta.app ?? '').toString().trim().toLowerCase()
    const metaRole = (meta.role ?? '').toString().trim()
    if (metaRole && STAFF_ROLES.has(metaRole)) {
      return { ok: false, error: INVALID_CREDENTIALS_MESSAGE }
    }

    if (metaApp && metaApp !== 'patient') {
      return { ok: false, error: INVALID_CREDENTIALS_MESSAGE }
    }

    return { ok: true }
  }, [])

  const refreshEnrollment = useCallback(async (userId) => {
    if (!userId) {
      setEnrollment(null)
      return null
    }
    try {
      const { isOnline } = await import('../lib/offline/connectivity')
      const { getMeta, setMeta } = await import('../lib/offline/db')
      if (!isOnline()) {
        const cached = await getMeta(`enrollment:${userId}`)
        if (cached) {
          setEnrollment(cached)
          return cached
        }
      }
      const active = await fetchActiveEnrollment(userId)
      setEnrollment(active)
      if (active) await setMeta(`enrollment:${userId}`, active)
      else await setMeta(`enrollment:${userId}`, null)
      return active
    } catch {
      try {
        const { getMeta } = await import('../lib/offline/db')
        const cached = await getMeta(`enrollment:${userId}`)
        if (cached) {
          setEnrollment(cached)
          return cached
        }
      } catch {
        /* ignore */
      }
      setEnrollment(null)
      return null
    }
  }, [])

  const patchEnrollment = useCallback(
    async (partial) => {
      let next = null
      setEnrollment((prev) => {
        next = prev ? { ...prev, ...partial } : partial ?? null
        return next
      })
      try {
        const { setMeta } = await import('../lib/offline/db')
        const userId = user?.id
        if (userId && next) await setMeta(`enrollment:${userId}`, next)
      } catch {
        /* ignore */
      }
      return next
    },
    [user?.id],
  )

  const upsertPatientContact = useCallback(async (nextUser) => {
    try {
      if (!nextUser) return

      const meta = nextUser.user_metadata ?? {}
      const fullNameFromMeta = (meta.full_name || meta.name || '').toString().trim()
      let firstName = (meta.first_name ?? '').toString().trim()
      let lastName = (meta.last_name ?? '').toString().trim()
      if ((!firstName || !lastName) && fullNameFromMeta) {
        const parts = fullNameFromMeta.split(/\s+/).filter(Boolean)
        if (!firstName) firstName = parts[0] || ''
        if (!lastName) lastName = parts.slice(1).join(' ') || ''
      }
      const phone = (meta.phone ?? '').toString().trim()
      const birthdate = (meta.birthdate ?? '').toString().trim().slice(0, 10) || null
      const disability = (meta.disability ?? '').toString().trim() || null
      const fullName = `${firstName} ${lastName}`.trim() || fullNameFromMeta || (nextUser.email ?? 'Patient')

      const { error: contactErr } = await supabase.from('patient_contacts').upsert(
        [
          {
            id: nextUser.id,
            email: nextUser.email ?? null,
            phone: phone || null,
            first_name: firstName || null,
            last_name: lastName || null,
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'id' },
      )
      if (contactErr) console.warn('[upsertPatientContact] patient_contacts error:', contactErr.message, contactErr.code)

      const profilePayload = {
        patient_auth_id: nextUser.id,
        name: fullName,
        first_name: firstName || null,
        last_name: lastName || null,
        email: nextUser.email ?? null,
        phone: phone || null,
        mobile_phone: phone || null,
        ...(birthdate ? { birthdate } : {}),
        ...(disability ? { disability } : {}),
      }

      // Prefer upsert when a real UNIQUE constraint exists; fall back to select+insert/update
      // because a partial unique index cannot be used as ON CONFLICT target (42P10).
      const { error: upsertErr } = await supabase
        .from('patients')
        .upsert(profilePayload, { onConflict: 'patient_auth_id' })

      if (upsertErr) {
        const { data: existing } = await supabase
          .from('patients')
          .select('id')
          .eq('patient_auth_id', nextUser.id)
          .maybeSingle()

        if (existing?.id) {
          const { error: updateErr } = await supabase
            .from('patients')
            .update(profilePayload)
            .eq('id', existing.id)
          if (updateErr) {
            console.warn('[upsertPatientContact] patients update error:', updateErr.message, updateErr.code)
          }
        } else {
          const { error: insertErr } = await supabase.from('patients').insert(profilePayload)
          if (insertErr && insertErr.code !== '23505') {
            console.warn('[upsertPatientContact] patients insert error:', insertErr.message, insertErr.code)
          }
        }
      }
    } catch (err) {
      console.error('[upsertPatientContact] unexpected error:', err)
    }
  }, [])

  const syncPatientSession = useCallback(
    async (nextUser) => {
      if (!nextUser) {
        setEnrollment(null)
        return
      }

      // 1. Ensure patient row exists
      await upsertPatientContact(nextUser)

      // 2. Enroll from any pending session selection
      // fetchActiveEnrollment already retries the patient lookup, so no fixed delay needed
      const enrollResult = await enrollFromSessionSelection(nextUser.id)
      console.log('[syncPatientSession] enrollFromSessionSelection:', enrollResult)

      // 3. Refresh enrollment state
      await refreshEnrollment(nextUser.id)
    },
    [refreshEnrollment, upsertPatientContact],
  )

  useEffect(() => {
    let isMounted = true
    let syncedUserId = null
    const gen = { current: 0 }

    const init = async () => {
      const myGen = ++gen.current
      setLoading(true)
      setError('')

      try {
        const me = await fetchAuthMe()
        if (!isMounted || myGen !== gen.current) return

        if (me?.ok && me.supabase) {
          await ensurePatientOfflineNamespace(me.user?.id)
          const session = await applySupabaseSession(me.supabase)
          const nextUser = session?.user ?? null
          if (nextUser) {
            const validation = await validatePatientUser(nextUser)
            if (!validation.ok) {
              await logoutSession().catch(() => null)
              await supabase.auth.signOut({ scope: 'local' })
              if (!isMounted || myGen !== gen.current) return
              setUser(null)
              setPatient(null)
              setEnrollment(null)
              setError(validation.error || INVALID_CREDENTIALS_MESSAGE)
              setLoading(false)
              return
            }
            setUser(nextUser)
            setPatient(buildPatient(nextUser))
            setLoading(false)
            syncedUserId = nextUser.id
            void syncPatientSession(nextUser)
            return
          }
        }
      } catch {
        /* no cookie session */
      }

      if (!isMounted || myGen !== gen.current) return
      setUser(null)
      setPatient(null)
      setEnrollment(null)
      setLoading(false)
    }

    init()

    const refreshTimer = setInterval(() => {
      void refreshAuthSession()
        .then(async (res) => {
          if (res?.supabase) await applySupabaseSession(res.supabase)
        })
        .catch(() => null)
    }, 10 * 60 * 1000)

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null
      if (!isMounted) return
      if (nextUser) {
        const validation = await validatePatientUser(nextUser)
        if (!validation.ok) {
          await supabase.auth.signOut({ scope: 'local' })
          setUser(null)
          setPatient(null)
          setEnrollment(null)
          setError(validation.error || INVALID_CREDENTIALS_MESSAGE)
          setLoading(false)
          return
        }
      }

      setUser(nextUser)
      setPatient(buildPatient(nextUser))
      setLoading(false)

      if (nextUser) {
        if (syncedUserId !== nextUser.id) {
          syncedUserId = nextUser.id
          void syncPatientSession(nextUser)
        }
      } else {
        syncedUserId = null
        setEnrollment(null)
      }
    })

    return () => {
      isMounted = false
      clearInterval(refreshTimer)
      subscription?.subscription?.unsubscribe?.()
    }
  }, [syncPatientSession, validatePatientUser])

  const signIn = useCallback(async ({ email, username, password }) => {
    setError('')
    try {
      const result = await Promise.race([
        loginWithPassword({ email, username, password }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Sign in timeout. Please try again.')), SIGN_IN_TIMEOUT_MS),
        ),
      ])

      if (result?.needsVerification) {
        if (result.supabase) {
          await applySupabaseSession(result.supabase).catch(() => null)
        }
        return {
          ok: false,
          needsVerification: true,
          userId: result.user?.id ?? null,
          email: result.user?.email ?? email,
          error: result.error || 'Please verify your email before signing in.',
        }
      }

      if (!result?.ok || !result.supabase) {
        const message = result?.error || INVALID_CREDENTIALS_MESSAGE
        setError(message)
        return { ok: false, error: message }
      }

      await prepareFreshPatientSession(result.user?.id)
      const session = await applySupabaseSession(result.supabase)
      const nextUser = session?.user ?? null

      if (nextUser) {
        const validation = await validatePatientUser(nextUser)
        if (!validation.ok) {
          await logoutSession().catch(() => null)
          await supabase.auth.signOut({ scope: 'local' })
          setUser(null)
          setPatient(null)
          setError(validation.error || INVALID_CREDENTIALS_MESSAGE)
          return { ok: false, error: validation.error || INVALID_CREDENTIALS_MESSAGE }
        }

        setUser(nextUser)
        setPatient(buildPatient(nextUser))
      }
      return { ok: true }
    } catch (err) {
      if (err?.payload?.needsVerification || err?.status === 403) {
        if (err?.payload?.supabase) {
          await applySupabaseSession(err.payload.supabase).catch(() => null)
        }
        return {
          ok: false,
          needsVerification: true,
          userId: err?.payload?.user?.id ?? null,
          email: err?.payload?.user?.email ?? email,
          error: err?.payload?.error || err?.message || 'Please verify your email before signing in.',
        }
      }
      const message = err?.message || INVALID_CREDENTIALS_MESSAGE
      setError(message)
      return { ok: false, error: message }
    }
  }, [validatePatientUser])

  const signUp = useCallback(async ({
    firstName,
    lastName,
    phone,
    password,
    passwordConfirmation,
    birthdate = null,
    disability = null,
    houseNoPurok,
    municipalityMode,
    municipality,
    barangay,
    province = 'Laguna',
  }) => {
    setError('')
    try {
      const { registerPatientAccount } = await import('../lib/apiClient')
      const result = await registerPatientAccount({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        password,
        password_confirmation: passwordConfirmation || password,
        birthdate,
        disability: disability || null,
        house_no_purok: houseNoPurok,
        municipality_mode: municipalityMode,
        municipality: municipality || null,
        barangay,
        province,
      })

      if (!result?.ok) {
        const message = result?.error || 'Failed to create account. Please try again.'
        setError(message)
        return { ok: false, error: message }
      }

      return {
        ok: true,
        username: result.username,
        phone: result.phone,
        smsSent: result.sms_sent,
        smsMocked: result.sms_mocked,
        message: result.message,
      }
    } catch (err) {
      const message = err?.payload?.error || err?.message || 'An unexpected error occurred. Please try again.'
      setError(message)
      return { ok: false, error: message }
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    setError('')
    try {
      const redirectTo = `${window.location.origin}/auth/callback`
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      })
      if (oauthError) {
        setError(oauthError.message || 'Google sign-in failed.')
        return { ok: false, error: oauthError.message }
      }
      return { ok: true, redirected: true }
    } catch (err) {
      const message = err?.message || 'Google sign-in failed.'
      setError(message)
      return { ok: false, error: message }
    }
  }, [])

  const completeOAuthSignIn = useCallback(async () => {
    setError('')
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const session = data?.session
      if (!session?.access_token || !session.user) {
        return { ok: false, error: 'Google sign-in did not complete. Please try again.' }
      }

      const nextUser = {
        ...session.user,
        user_metadata: {
          ...(session.user.user_metadata || {}),
          app: session.user.user_metadata?.app || 'patient',
        },
      }

      const validation = await validatePatientUser(nextUser)
      if (!validation.ok) {
        await supabase.auth.signOut({ scope: 'local' })
        return { ok: false, error: validation.error || INVALID_CREDENTIALS_MESSAGE }
      }

      await prepareFreshPatientSession(nextUser.id)
      await upsertPatientContact(nextUser)
      await bridgeAuthSession({
        accessToken: session.access_token,
        refreshToken: session.refresh_token || null,
        expiresIn: session.expires_in || 3600,
      })

      setUser(nextUser)
      setPatient(buildPatient(nextUser))

      return {
        ok: true,
        needsVerification: !isPatientEmailVerified(nextUser),
        userId: nextUser.id,
        email: nextUser.email,
      }
    } catch (err) {
      const message = err?.message || 'Google sign-in failed.'
      setError(message)
      return { ok: false, error: message }
    }
  }, [upsertPatientContact, validatePatientUser])

  const signOut = useCallback(async () => {
    setError('')
    try {
      await logoutSession()
    } catch {
      /* ignore */
    }
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      /* ignore */
    }
    await clearPatientOffline()
    setUser(null)
    setPatient(null)
    setEnrollment(null)
  }, [])

  const resetPassword = useCallback(async (email) => {
    setError('')
    try {
      const result = await requestPasswordReset({ email: email.trim().toLowerCase() })
      if (!result?.ok) {
        const message = result?.error || 'This email is not registered in HealthTrack'
        setError(message)
        return { ok: false, error: message }
      }
      return {
        ok: true,
        message: result.message || 'Password reset link sent. Check your inbox (and spam folder).',
      }
    } catch (err) {
      const message = err?.message || 'Failed to send reset email.'
      setError(message)
      return { ok: false, error: message }
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      patient,
      enrollment,
      refreshEnrollment,
      patchEnrollment,
      loading,
      error,
      signIn,
      signUp,
      signInWithGoogle,
      completeOAuthSignIn,
      signOut,
      resetPassword,
    }),
    [enrollment, error, loading, patient, patchEnrollment, refreshEnrollment, resetPassword, signIn, signInWithGoogle, completeOAuthSignIn, signOut, signUp, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
