import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  applySupabaseSession,
  clearPatientOffline,
  ensurePatientOfflineNamespace,
  prepareFreshPatientSession,
  supabase,
} from '../lib/supabaseClient'
import { fetchAuthMe, loginWithPassword, logoutSession, refreshAuthSession } from '../lib/apiClient'

import { AuthContext, buildPatient } from './AuthContextObject'
import {
  enrollFromSessionSelection,
  fetchActiveEnrollment,
} from '../lib/patientServiceEnrollment'

const STAFF_ROLES = new Set(['Admin', 'Doctor', 'Nurse'])
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
      const firstName = (meta.first_name ?? '').toString().trim()
      const lastName = (meta.last_name ?? '').toString().trim()
      const phone = (meta.phone ?? '').toString().trim()
      const fullName = `${firstName} ${lastName}`.trim() || (nextUser.email ?? 'Patient')

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

      const { error: insertErr } = await supabase.from('patients').insert(
        {
          patient_auth_id: nextUser.id,
          name: fullName,
          email: nextUser.email ?? null,
          phone: phone || null,
        },
      )
      if (insertErr && insertErr.code !== '23505') {
        console.warn('[upsertPatientContact] patients insert error:', insertErr.message, insertErr.code)
      } else if (!insertErr) {
        console.log('[upsertPatientContact] patients row created for', nextUser.id)
      } else {
        console.log('[upsertPatientContact] patients row already exists for', nextUser.id)
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

  const signIn = useCallback(async ({ email, password }) => {
    setError('')
    try {
      const result = await Promise.race([
        loginWithPassword({ email, password }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Sign in timeout. Please try again.')), SIGN_IN_TIMEOUT_MS),
        ),
      ])

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
      const message = err?.message || INVALID_CREDENTIALS_MESSAGE
      setError(message)
      return { ok: false, error: message }
    }
  }, [validatePatientUser])

  const signUp = useCallback(async ({ email, password, firstName, lastName, phone }) => {
    setError('')
    try {
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedFirstName = firstName.trim()
    const normalizedLastName = lastName.trim()
    const normalizedFullName = `${normalizedFirstName} ${normalizedLastName}`.trim().toLowerCase()

    // Check patient_contacts and patients tables for already-verified accounts
    const [existingEmailContact, existingNameContact, existingEmailPatient, existingNamePatient] = await Promise.all([
      supabase.from('patient_contacts').select('id').ilike('email', normalizedEmail).limit(1),
      supabase
        .from('patient_contacts')
        .select('id')
        .ilike('first_name', normalizedFirstName)
        .ilike('last_name', normalizedLastName)
        .limit(1),
      supabase.from('patients').select('id').ilike('email', normalizedEmail).limit(1),
      supabase.from('patients').select('id').ilike('name', normalizedFullName).limit(1),
    ])

    const emailAlreadyRegistered = Boolean(existingEmailContact.data?.length || existingEmailPatient.data?.length)
    const nameAlreadyRegistered = Boolean(existingNameContact.data?.length || existingNamePatient.data?.length)

    if (emailAlreadyRegistered && nameAlreadyRegistered) {
      const message = 'This email and name are already registered. Please use a different account details combination.'
      setError(message)
      return { ok: false, error: message }
    }

    if (emailAlreadyRegistered) {
      const message = 'This email is already registered.'
      setError(message)
      return { ok: false, error: message }
    }

    if (nameAlreadyRegistered) {
      const message = 'This name is already registered.'
      setError(message)
      return { ok: false, error: message }
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          app: 'patient',
          first_name: normalizedFirstName,
          last_name: normalizedLastName,
          phone,
        },
      },
    })

    if (signUpError) {
      const rawMessage = signUpError.message || signUpError.error_description || ''
      console.error('[signUp] Supabase error:', signUpError)
      const message = rawMessage || `Registration failed (${signUpError.status ?? 'unknown'}). Please try again.`
      setError(message)
      return { ok: false, error: message }
    }

    // Supabase returns identities: [] when the email already exists in auth.users
    // (even if unverified). Treat this as "already registered".
    const nextUser = data?.user ?? null
    if (nextUser && Array.isArray(nextUser.identities) && nextUser.identities.length === 0) {
      const message = 'This email is already registered. Please verify your email or use a different address.'
      setError(message)
      return { ok: false, error: message }
    }

    const needsEmailVerification = false

    // Insert patient record immediately — no email verification required.
    // Establish HttpOnly Sanctum session (do not rely on localStorage tokens).
    if (nextUser) {
      await upsertPatientContact(nextUser)
      const login = await loginWithPassword({ email: normalizedEmail, password })
      if (login?.ok && login.supabase) {
        await prepareFreshPatientSession(login.user?.id || nextUser.id)
        await applySupabaseSession(login.supabase)
      }
      setUser(nextUser)
      setPatient(buildPatient(nextUser))
    }

    return {
      ok: true,
      userId: nextUser?.id ?? null,
      needsEmailVerification,
      message: 'Registration successful. You can now log in with your account.',
    }
    } catch (err) {
      console.error('[signUp] Unexpected error:', err)
      const message = err?.message || 'An unexpected error occurred. Please try again.'
      setError(message)
      return { ok: false, error: message }
    }
  }, [upsertPatientContact])

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
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email)
    if (resetError) {
      setError(resetError.message)
      return { ok: false, error: resetError.message }
    }
    return { ok: true }
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
      signOut,
      resetPassword,
    }),
    [enrollment, error, loading, patient, patchEnrollment, refreshEnrollment, resetPassword, signIn, signOut, signUp, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
