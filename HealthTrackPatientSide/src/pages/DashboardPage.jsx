import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ModuleEmptyState from '../components/ModuleEmptyState'
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
  const joinedQueue = Boolean(location.state?.joinedQueue || location.state?.appointmentBooked)
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
  const readyForQueue = enrollment && !needsIntake

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
              <span className={`patient-dash-online-dot ${online ? '' : '!bg-amber-300'}`} />
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

      {loading ? <p className="info-banner">Loading your dashboard…</p> : null}
      {error ? <p className="error-banner">Dashboard error: {error}</p> : null}

      {serviceName ? (
        <section className="patient-charter-card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="patient-panel-eyebrow">Current service</p>
              <h3 className="patient-panel-title mt-1">{serviceName}</h3>
              {enrollment?.service_types?.description ? (
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{enrollment.service_types.description}</p>
              ) : null}
            </div>
            <span
              className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                needsIntake
                  ? 'bg-amber-50 text-amber-900 ring-amber-200'
                  : 'bg-emerald-50 text-emerald-900 ring-emerald-200'
              }`}
            >
              {needsIntake ? 'Info form needed' : readyForQueue ? 'Ready to queue' : 'Active'}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {needsIntake ? (
              <Link to="/dashboard/service-intake" className="primary-btn !mt-0 !w-auto !bg-teal-700 hover:!bg-teal-600">
                Complete service info
              </Link>
            ) : (
              <Link to="/dashboard/queue" className="primary-btn !mt-0 !w-auto !bg-teal-700 hover:!bg-teal-600">
                Get queue number
              </Link>
            )}
            {!needsIntake ? (
              <Link to="/dashboard/service-intake" className="secondary-btn !mt-0">
                Review intake
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/dashboard/queue" className="patient-stat-card no-underline">
          <div className="patient-stat-icon">
            <DashIcon name="queue" />
          </div>
          <div>
            <p className="patient-stat-label">Queue tickets</p>
            <p className="patient-stat-value">{counts.tickets}</p>
          </div>
        </Link>
        <Link to="/dashboard/medical-records" className="patient-stat-card no-underline">
          <div className="patient-stat-icon !bg-emerald-50 !text-emerald-700">
            <DashIcon name="records" />
          </div>
          <div>
            <p className="patient-stat-label">Medical records</p>
            <p className="patient-stat-value">{counts.records}</p>
          </div>
        </Link>
      </div>

      <section className="patient-panel">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="patient-panel-title">Active ticket</h3>
          <Link to="/dashboard/queue" className="text-sm font-semibold text-teal-700 hover:text-teal-600">
            Open My Queue
          </Link>
        </div>
        {activeTicket ? (
          <div className="patient-ticket-card">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Your number</p>
            <p className="patient-ticket-number">{labelOf(activeTicket)}</p>
            <p className="mt-2 text-sm font-semibold text-teal-900">{ticketStatusText(activeTicket.status)}</p>
            {activeTicket.reason ? <p className="mt-1 text-sm text-teal-800/80">{activeTicket.reason}</p> : null}
          </div>
        ) : (
          <ModuleEmptyState
            title="No active ticket"
            description="When you arrive at the RHU, join the queue and your number will show here."
          />
        )}
      </section>

      <section className="patient-panel">
        <h3 className="patient-panel-title mb-4">Quick links</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <Link to="/dashboard/follow-ups" className="patient-quick-link">
            <span className="patient-quick-link-icon">
              <DashIcon name="calendar" />
            </span>
            Follow-ups
          </Link>
          <Link to="/dashboard/service-status" className="patient-quick-link">
            <span className="patient-quick-link-icon">
              <DashIcon name="status" />
            </span>
            Service status
          </Link>
          <Link to="/dashboard/medical-records" className="patient-quick-link">
            <span className="patient-quick-link-icon">
              <DashIcon name="records" />
            </span>
            Records & PDFs
          </Link>
        </div>
      </section>
    </section>
  )
}
