import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { supabase } from '../lib/supabaseClient'
import { MODULES } from '../config/rbac'
import { useOnlineStatus } from '../lib/offline/connectivity'
import { listLocalQueue, countPendingOutbox } from '../lib/offline/queueService'
import { startAutoSync } from '../lib/offline/syncEngine'

function StatIcon({ children, className }) {
  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${className}`}>
      {children}
    </div>
  )
}

export default function NurseDashboardPage() {
  const { profile } = useAuth()
  const online = useOnlineStatus()
  const [stats, setStats] = useState({
    waitingQueue: 0,
    calledQueue: 0,
    totalPatients: 0,
    activeRequests: 0,
  })
  const [loading, setLoading] = useState(true)
  const [pendingSync, setPendingSync] = useState(0)

  const loadDashboardStats = useCallback(async () => {
    try {
      setLoading(true)

      const localQueue = await listLocalQueue()
      const waitingQueue = localQueue.filter((r) => (r.status ?? '').toLowerCase() === 'waiting').length
      const calledQueue = localQueue.filter((r) =>
        ['next', 'called'].includes((r.status ?? '').toLowerCase()),
      ).length

      let totalPatients = 0
      let activeRequests = 0
      if (online) {
        const { count: patientCount } = await supabase.from('patients').select('*', { count: 'exact', head: true })
        const { count: activeRequestsCount } = await supabase
          .from('service_requests')
          .select('*', { count: 'exact', head: true })
          .is('archived_at', null)
          .not('current_status', 'eq', 'completed')
          .not('current_status', 'eq', 'cancelled')
        totalPatients = patientCount || 0
        activeRequests = activeRequestsCount || 0
      }

      setStats({
        waitingQueue,
        calledQueue,
        totalPatients,
        activeRequests,
      })
      setPendingSync(await countPendingOutbox())
    } catch (error) {
      console.error('Error loading dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }, [online])

  useEffect(() => {
    void loadDashboardStats()
    const stop = startAutoSync({ intervalMs: 30000 })
    return () => stop()
  }, [loadDashboardStats])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const currentTime = new Date().toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  const firstName = (profile?.name || 'Nurse').toString().split(' ')[0]

  return (
    <div className="staff-dash">
      <div className="staff-dash-hero">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-teal-200/15 blur-3xl" />
        <div className="relative z-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-100/90">Nurse station · RHU Pila</p>
          <h1 className="staff-dash-hero-title mt-2">
            {greeting}, {firstName}
          </h1>
          <p className="staff-dash-hero-lead">
            Manage the queue, release permits at Service Desk, and keep patient flow moving — even offline.
          </p>
          <div className="staff-dash-hero-meta">
            <span className={`staff-dash-hero-dot ${online ? '' : '!bg-amber-300'}`} />
            <span>{currentTime}</span>
            <span>·</span>
            <span>{online ? (loading ? 'Updating stats…' : 'Connected') : 'Offline mode'}</span>
            {pendingSync > 0 ? (
              <>
                <span>·</span>
                <span className="text-amber-100">{pendingSync} pending sync</span>
              </>
            ) : null}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              to={`/dashboard/${MODULES.QUEUE}`}
              className="inline-flex items-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-teal-900 transition hover:bg-teal-50"
            >
              Open Queue
            </Link>
            <Link
              to={`/dashboard/${MODULES.NURSE_SERVICE_DESK}`}
              className="inline-flex items-center rounded-xl border border-white/30 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
            >
              Service Desk
            </Link>
          </div>
        </div>
      </div>

      <div className="staff-dash-stat-grid">
        <Link to={`/dashboard/${MODULES.QUEUE}`} className="block h-full no-underline">
          <div className="staff-dash-stat-card">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Waiting</p>
              <StatIcon className="bg-teal-50 text-teal-700">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </StatIcon>
            </div>
            <p className="staff-dash-stat-value mt-3 text-teal-700">{stats.waitingQueue}</p>
            <p className="mt-1 text-sm text-slate-500">In line</p>
          </div>
        </Link>

        <Link to={`/dashboard/${MODULES.QUEUE}`} className="block h-full no-underline">
          <div className="staff-dash-stat-card">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Called / Next</p>
              <StatIcon className="bg-sky-50 text-sky-700">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </StatIcon>
            </div>
            <p className="staff-dash-stat-value mt-3 text-sky-700">{stats.calledQueue}</p>
            <p className="mt-1 text-sm text-slate-500">At counter</p>
          </div>
        </Link>

        <Link to={`/dashboard/${MODULES.NURSE_SERVICE_DESK}`} className="block h-full no-underline">
          <div className="staff-dash-stat-card">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Active requests</p>
              <StatIcon className="bg-emerald-50 text-emerald-700">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </StatIcon>
            </div>
            <p className="staff-dash-stat-value mt-3 text-emerald-700">{stats.activeRequests}</p>
            <p className="mt-1 text-sm text-slate-500">In progress</p>
          </div>
        </Link>

        <Link to="/dashboard/patient-records" className="block h-full no-underline">
          <div className="staff-dash-stat-card">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Patients</p>
              <StatIcon className="bg-slate-100 text-slate-700">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 12H9m6 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </StatIcon>
            </div>
            <p className="staff-dash-stat-value mt-3 text-slate-800">{stats.totalPatients}</p>
            <p className="mt-1 text-sm text-slate-500">In the system</p>
          </div>
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold tracking-tight text-slate-900" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
          Quick actions
        </h2>
        <div className="staff-dash-actions-grid mt-4">
          <Link to={`/dashboard/${MODULES.QUEUE}`}>
            <button type="button" className="staff-action-btn staff-action-btn-teal">
              Open Queue
            </button>
          </Link>
          <Link to={`/dashboard/${MODULES.NURSE_SERVICE_DESK}`}>
            <button type="button" className="staff-action-btn staff-action-btn-slate">
              Service Desk
            </button>
          </Link>
          <Link to="/dashboard/patient-records">
            <button type="button" className="staff-action-btn staff-action-btn-emerald">
              Patients
            </button>
          </Link>
          <Link to={`/dashboard/${MODULES.INVENTORY}`}>
            <button type="button" className="staff-action-btn">
              Inventory
            </button>
          </Link>
        </div>
      </div>

      <div className="staff-tip">
        <span className="font-semibold">Tip:</span> Permits, health card, death cert review, and pre-marriage go to{' '}
        <Link to={`/dashboard/${MODULES.NURSE_SERVICE_DESK}`} className="font-semibold underline underline-offset-2">
          Service Desk
        </Link>
        . Medical Certificate stays with the Doctor.
      </div>
    </div>
  )
}
