import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabaseClient'
import { useOnlineStatus } from '../lib/offline/connectivity'
import { listMyLocalTickets } from '../lib/offline/joinQueue'
import { startPatientAutoSync } from '../lib/offline/syncEngine'

function DashIcon({ name }) {
  const common = 'h-5 w-5'
  if (name === 'queue') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M3 6h18M3 12h18M3 18h12M19 16l2 2-2 2" />
      </svg>
    )
  }
  if (name === 'records') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M9 12h6M9 16h6M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9l-7-7z" />
        <path d="M13 2v7h7" />
      </svg>
    )
  }
  if (name === 'plus') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    )
  }
  if (name === 'status') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M12 20V10M18 20V4M6 20v-4" />
      </svg>
    )
  }
  if (name === 'calendar') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18" />
      </svg>
    )
  }
  if (name === 'form') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <path d="M9 5a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2v0z" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    )
  }
  if (name === 'user') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={common} aria-hidden="true">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0114 0" />
      </svg>
    )
  }
  return null
}

function labelOf(ticket) {
  if (!ticket) return null
  if (ticket.queue_label) return ticket.queue_label
  if (ticket.queue_number) {
    return `${ticket.service_code || 'RHU'}-${String(ticket.queue_number).padStart(3, '0')}`
  }
  return null
}

function ticketStatusText(status) {
  const v = (status ?? '').toLowerCase()
  if (v === 'waiting') return 'Waiting in line'
  if (v === 'called') return 'Please proceed to the counter'
  if (v === 'next') return 'You are next'
  if (v === 'skipped') return 'Skipped — wait to be recalled'
  return status || '—'
}

export default function DashboardPage() {
  const { user, patient, enrollment } = useAuth()
  const location = useLocation()
  const online = useOnlineStatus()
  const joinedQueue = Boolean(location.state?.joinedQueue)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTicket, setActiveTicket] = useState(null)
  const [counts, setCounts] = useState({ tickets: 0, records: 0 })
  const [now, setNow] = useState(() => new Date())
  const [patientRowId, setPatientRowId] = useState(enrollment?.patient_id ?? null)

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    const resolve = async () => {
      if (enrollment?.patient_id) {
        if (!cancelled) setPatientRowId(enrollment.patient_id)
        return
      }
      if (!user?.id) return
      const { data } = await supabase.from('patients').select('id').eq('patient_auth_id', user.id).maybeSingle()
      if (!cancelled) setPatientRowId(data?.id ?? null)
    }
    void resolve()
    return () => {
      cancelled = true
    }
  }, [enrollment?.patient_id, user?.id])

  useEffect(() => {
    let isMounted = true

    const load = async ({ soft = false } = {}) => {
      if (!user) return
      if (!soft) setLoading(true)
      setError('')

      try {
        const local = await listMyLocalTickets({
          patientId: patientRowId,
          patientAuthId: user.id,
        })
        const active =
          local.find((t) =>
            ['waiting', 'next', 'called', 'skipped'].includes((t.status ?? '').toLowerCase()),
          ) ?? null

        let records = 0
        if (online) {
          const { count, error: recordsError } = await supabase
            .from('patient_records')
            .select('id', { count: 'exact', head: true })
            .eq('patient_auth_id', user.id)
            .eq('workflow_status', 'completed')
          if (recordsError) setError(recordsError.message)
          records = count ?? 0
        }

        if (!isMounted) return
        setActiveTicket(active)
        setCounts({ tickets: local.length, records })
      } catch (e) {
        if (isMounted) setError(e?.message || 'Failed to load dashboard.')
      } finally {
        if (isMounted && !soft) setLoading(false)
      }
    }

    void load()
    const stop = startPatientAutoSync({
      patientId: patientRowId,
      patientAuthId: user?.id,
      intervalMs: 15000,
      onAfterSync: () => {
        if (isMounted) void load({ soft: true })
      },
    })

    return () => {
      isMounted = false
      stop()
    }
  }, [user, patientRowId, online])

  const greeting = useMemo(() => {
    const hour = now.getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }, [now])

  const clockLabel = useMemo(() => {
    try {
      return now.toLocaleString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return ''
    }
  }, [now])

  const displayName = patient?.firstName || patient?.name?.split(' ')?.[0] || 'Patient'
  const serviceName = enrollment?.service_types?.name ?? null
  const needsIntake = enrollment?.status === 'Draft'
  const activeLabel = labelOf(activeTicket)
  const menuItems = [
    {
      to: '/dashboard/service-intake',
      title: 'Service Info',
      desc: 'Complete and review required service details.',
      icon: 'form',
      badge: needsIntake ? 'Needs update' : 'Updated',
    },
    {
      to: '/dashboard/queue',
      title: 'My Queue',
      desc: 'Get queue number and track your turn.',
      icon: 'queue',
      badge: activeLabel ? `Active ${activeLabel}` : `${counts.tickets} ticket${counts.tickets === 1 ? '' : 's'}`,
    },
    {
      to: '/dashboard/service-status',
      title: 'Service Status',
      desc: 'Check progress and document availability.',
      icon: 'status',
      badge: serviceName ? serviceName : 'No service selected',
    },
    {
      to: '/dashboard/medical-records',
      title: 'Medical Records',
      desc: 'View records, permits, and PDFs.',
      icon: 'records',
      badge: `${counts.records} record${counts.records === 1 ? '' : 's'}`,
    },
    {
      to: '/dashboard/follow-ups',
      title: 'Follow-ups',
      desc: 'See vaccine and treatment reminders.',
      icon: 'calendar',
      badge: 'Schedules',
    },
    {
      to: '/dashboard/profile',
      title: 'Profile',
      desc: 'Update contact and address details.',
      icon: 'user',
      badge: 'Account',
    },
  ]

  return (
    <section className="patient-dash">
      {joinedQueue ? (
        <p className="info-banner">You joined the RHU queue. Staff can see your ticket at the counter.</p>
      ) : null}

      <div className="patient-dash-hero">
        <div className="patient-dash-hero-glow" aria-hidden="true" />
        <div className="patient-dash-hero-glow-2" aria-hidden="true" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="patient-dash-eyebrow">HealthTrack Patient Portal</p>
            <h2 className="patient-dash-greeting">
              {greeting}, {displayName}
            </h2>
            <p className="patient-dash-lead">
              Join the RHU Pila queue when you arrive, then track your visit and download permits or certificates here.
            </p>
            {clockLabel ? <p className="patient-dash-clock">{clockLabel}</p> : null}
            <p className="patient-dash-online">
              <span className={`patient-dash-online-dot ${online ? '' : 'bg-amber-300!'}`} />
              {online ? 'Online' : 'Offline — tickets sync when you reconnect'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="patient-dash-btn-primary" to="/dashboard/queue">
              <DashIcon name="plus" />
              Join queue
            </Link>
            <Link className="patient-dash-btn-secondary" to="/dashboard/medical-records">
              Medical records
            </Link>
          </div>
        </div>
      </div>

      {activeTicket ? (
        <section className="patient-ticket-card" aria-labelledby="current-visit-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="patient-panel-eyebrow text-teal-700">Current visit</p>
              <h3 id="current-visit-title" className="patient-ticket-number">{activeLabel || 'Queue ticket'}</h3>
              <p className="mt-1 text-sm font-semibold text-teal-900">{ticketStatusText(activeTicket.status)}</p>
              <p className="mt-1 text-xs text-slate-600">{serviceName || 'RHU Pila service'} · Keep this screen ready when called.</p>
            </div>
            <Link className="patient-dash-btn-primary bg-teal-800! text-white! hover:bg-teal-700!" to="/dashboard/queue">
              View queue
            </Link>
          </div>
        </section>
      ) : null}

      {loading ? <p className="info-banner" role="status" aria-live="polite">Loading your dashboard…</p> : null}
      {error ? <p className="error-banner" role="alert">Dashboard error: {error}</p> : null}

      <section className="patient-panel">
        <h3 className="patient-panel-title mb-4">Main menu</h3>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {menuItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="patient-quick-link min-h-[126px] flex-col items-stretch justify-between no-underline shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="patient-quick-link-icon">
                  <DashIcon name={item.icon} />
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  {item.badge}
                </span>
              </div>
              <p className="m-0 text-base font-bold text-slate-900">{item.title}</p>
              <p className="mt-1 text-sm text-slate-600">{item.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </section>
  )
}
