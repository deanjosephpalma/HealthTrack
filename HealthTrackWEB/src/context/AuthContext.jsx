import { useEffect, useMemo, useRef, useState } from 'react'
import { applySupabaseSession, ensureStaffOfflineNamespace, PORTAL, secureSignOut, supabase } from '../lib/supabaseClient'
import { fetchAuthMe, refreshAuthSession } from '../lib/apiClient'
import { AuthContext } from './AuthContextObject'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)
  const [profileError, setProfileError] = useState('')
  const profileReqId = useRef(0)

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      setLoading(true)
      try {
        const me = await fetchAuthMe(PORTAL)
        if (cancelled) return
        if (me?.ok && me.supabase) {
          await ensureStaffOfflineNamespace(me.user?.id)
          const nextSession = await applySupabaseSession(me.supabase)
          if (!cancelled) setSession(nextSession)
        } else if (!cancelled) {
          setSession(null)
        }
      } catch {
        if (!cancelled) setSession(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    const refreshTimer = setInterval(() => {
      void refreshAuthSession(PORTAL)
        .then(async (res) => {
          if (res?.supabase) await applySupabaseSession(res.supabase)
        })
        .catch(() => null)
    }, 10 * 60 * 1000)

    return () => {
      cancelled = true
      subscription.unsubscribe()
      clearInterval(refreshTimer)
    }
  }, [])

  useEffect(() => {
    const reqId = ++profileReqId.current

    const loadProfile = async () => {
      const userId = session?.user?.id

      if (!userId) {
        if (profileReqId.current === reqId) {
          setProfile(null)
          setProfileError('')
          setProfileLoading(false)
        }
        return
      }

      setProfileLoading(true)
      setProfileError('')

      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email, role, created_at')
        .eq('id', userId)
        .maybeSingle()

      if (profileReqId.current !== reqId) return

      if (error) {
        setProfile(null)
        setProfileError(error.message)
        setProfileLoading(false)
        return
      }

      const nextProfile = data ?? null
      const validRole = nextProfile && ['Doctor', 'Nurse'].includes(nextProfile.role)
      if (!validRole) {
        await secureSignOut()
        setSession(null)
        setProfile(null)
        setProfileError('This account is not allowed here. Use an approved doctor or nurse account, or the Patient Portal.')
        setProfileLoading(false)
        return
      }

      setProfile(nextProfile)
      setProfileLoading(false)
    }

    loadProfile()
  }, [session?.user?.id])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      profile,
      role: profile?.role ?? null,
      profileLoading,
      profileError,
      signOut: async () => {
        await secureSignOut()
        setSession(null)
        setProfile(null)
      },
    }),
    [session, loading, profile, profileLoading, profileError],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
