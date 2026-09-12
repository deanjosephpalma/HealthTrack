import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Fragment, useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/useAuth'
import LogoutConfirmModal from './LogoutConfirmModal'
import { supabase } from '../lib/supabaseClient'

const MODULES = [
  { key: 'dashboard', label: 'Main Menu', path: '/dashboard', icon: 'home' },
  { key: 'service-intake', label: 'Service Info', path: '/dashboard/service-intake', icon: 'form' },
  { key: 'queue', label: 'My Queue', path: '/dashboard/queue', icon: 'queue' },
  { key: 'follow-ups', label: 'Follow-ups', path: '/dashboard/follow-ups', icon: 'calendar' },
  { key: 'service-status', label: 'Service Status', path: '/dashboard/service-status', icon: 'status' },
  { key: 'medical', label: 'Medical Records', path: '/dashboard/medical-records', icon: 'records' },
  { key: 'profile', label: 'Profile', path: '/dashboard/profile', icon: 'user' },
]

const MODULE_SECTIONS = {
  dashboard: 'Overview',
  'service-intake': 'Your visit',
  queue: 'Your visit',
  'follow-ups': 'Care plan',
  'service-status': 'Care plan',
  medical: 'Records',
  profile: 'Account',
}

function NavIcon({ name }) {
  const c = 'h-4 w-4'
  if (name === 'home') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden="true">
        <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />
      </svg>
    )
  }
  if (name === 'form') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden="true">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <path d="M9 5a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2v0z" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    )
  }
  if (name === 'queue') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    )
  }
  if (name === 'calendar') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18" />
      </svg>
    )
  }
  if (name === 'status') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden="true">
        <path d="M12 20V10M18 20V4M6 20v-4" />
      </svg>
    )
  }
  if (name === 'records') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden="true">
        <path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0114 0" />
    </svg>
  )
}

function BellIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function SidebarContent({ patientName, onLogout, onNavigate }) {
  const patientInitial = patientName?.trim().charAt(0).toUpperCase() || 'P'
  return (
    <div className="patient-sidebar-content flex h-full min-h-0 flex-col">
      <div className="sidebar-brand">
        <p className="chip mb-2">HealthTrack · RHU Pila</p>
        <h2 className="sidebar-title">Patient Portal</h2>
        <p className="sidebar-subtitle">{patientName || 'Signed in'}</p>
      </div>

      <nav className="menu-list patient-sidebar-nav" aria-label="Patient modules">
        {MODULES.map((item, index) => {
          const previous = MODULES[index - 1]
          const section = MODULE_SECTIONS[item.key]
          const startsSection = !previous || MODULE_SECTIONS[previous.key] !== section
          return (
            <Fragment key={item.key}>
              {startsSection ? <p className="menu-section-label">{section}</p> : null}
              <NavLink
                to={item.path}
                end={item.path === '/dashboard'}
                onClick={onNavigate}
                className={({ isActive }) => (isActive ? 'menu-link menu-link-active' : 'menu-link')}
              >
                <span className="menu-link-icon">
                  <NavIcon name={item.icon} />
                </span>
                {item.label}
              </NavLink>
            </Fragment>
          )
        })}
      </nav>

      <div className="mt-auto pt-4">
        <div className="patient-sidebar-account">
          <span className="patient-sidebar-avatar" aria-hidden="true">{patientInitial}</span>
          <span className="min-w-0 flex-1">
            <strong>{patientName || 'Patient account'}</strong>
            <small><i aria-hidden="true" />Securely signed in</small>
          </span>
          <button className="patient-sidebar-signout" type="button" onClick={onLogout} aria-label="Sign out">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
              <path d="M21 19V5a2 2 0 00-2-2h-6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

const PAGE_COPY = {
  '/dashboard': {
    kicker: 'Main Menu',
    title: null,
    subtitle: null,
  },
  '/dashboard/queue': {
    kicker: 'Visit today',
    title: 'My Queue',
    subtitle: 'Get in line for staff, then track your queue number.',
  },
  '/dashboard/service-intake': {
    kicker: 'Service',
    title: 'Service information',
    subtitle: 'Complete intake details for your selected RHU service.',
  },
  '/dashboard/follow-ups': {
    kicker: 'Care plan',
    title: 'Follow-up schedules',
    subtitle: 'Upcoming vaccine, TB monitoring, or outpatient check-up visits.',
  },
  '/dashboard/service-status': {
    kicker: 'Progress',
    title: 'Service status',
    subtitle: 'Track requests and download issued documents when ready.',
  },
  '/dashboard/medical-records': {
    kicker: 'Records',
    title: 'Medical records',
    subtitle: 'Consult history, permits, and downloadable certificates.',
  },
  '/dashboard/profile': {
    kicker: 'Account',
    title: 'Profile',
    subtitle: 'Keep your personal details up to date for walk-ins.',
  },
}

export default function PatientDashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { patient, signOut } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const dropdownRef = useRef(null)

  const pageMeta = PAGE_COPY[location.pathname] || {
    kicker: 'HealthTrack',
    title: patient?.name || 'Patient',
    subtitle: 'Rural Health Unit of Pila',
  }
  const hidePageHeader = location.pathname === '/dashboard'
  const todayLabel = new Intl.DateTimeFormat('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date())

  const handleLogoutRequest = () => {
    setLogoutOpen(true)
  }

  const handleLogoutConfirm = async () => {
    setLogoutBusy(true)
    try {
      await signOut()
      navigate('/login', { replace: true })
    } finally {
      setLogoutBusy(false)
      setLogoutOpen(false)
    }
  }

  const handleNavigate = () => {
    setMobileMenuOpen(false)
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowNotifications(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    let isMounted = true

    const loadNotifications = async () => {
      if (!patient?.patient_auth_id) return
      const { data, error } = await supabase
        .from('patient_notifications')
        .select('id, title, message, notification_type, created_at')
        .eq('patient_auth_id', patient.patient_auth_id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        console.error('Error fetching notifications:', error)
        return
      }
      if (isMounted) setNotifications(data ?? [])
    }

    void loadNotifications()

    const channel = supabase
      .channel(`notifications-patient-${patient?.patient_auth_id || 'guest'}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'patient_notifications',
          filter: patient?.patient_auth_id ? `patient_auth_id=eq.${patient.patient_auth_id}` : undefined,
        },
        (payload) => {
          if (!isMounted) return
          if (payload.new) {
            setNotifications((prev) => [payload.new, ...prev].slice(0, 20))
            setUnreadCount((prev) => prev + 1)
          }
        },
      )
      .subscribe()

    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [patient?.patient_auth_id])

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications)
    if (!showNotifications) setUnreadCount(0)
  }

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <SidebarContent patientName={patient?.name} onLogout={handleLogoutRequest} onNavigate={handleNavigate} />
      </aside>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="patient-mobile-drawer absolute left-0 top-0 flex h-full w-[86%] max-w-[320px] flex-col overflow-auto rounded-r-3xl border-r border-slate-200 bg-white/95 p-5 shadow-2xl backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <p className="chip mb-0">Menu</p>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setMobileMenuOpen(false)}
              >
                Close
              </button>
            </div>
            <SidebarContent patientName={patient?.name} onLogout={handleLogoutRequest} onNavigate={handleNavigate} />
          </div>
        </div>
      ) : null}

      <section className="app-main">
        <header className={`app-header ${hidePageHeader ? 'mb-3! border-0! pb-0!' : ''}`}>
          <div className="min-w-0 flex-1">
            {hidePageHeader ? (
              <p className="app-header-kicker">Rural Health Unit of Pila</p>
            ) : (
              <>
                <p className="app-header-kicker">{pageMeta.kicker}</p>
                <h1 className="dashboard-title mt-1">{pageMeta.title}</h1>
                {pageMeta.subtitle ? <p className="dashboard-subtitle mt-1">{pageMeta.subtitle}</p> : null}
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="patient-header-status" aria-label="Portal status">
              <span aria-hidden="true" />
              <div><strong>HealthTrack</strong><small>{todayLabel}</small></div>
            </div>
            <div className="relative" ref={dropdownRef}>
              <button type="button" className="header-icon-btn" onClick={toggleNotifications} aria-label="Notifications">
                <BellIcon className="h-5 w-5" />
                {unreadCount > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                ) : null}
              </button>

              {showNotifications ? (
                <div className="absolute right-0 z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
                    <h3 className="text-sm font-bold text-slate-900">Notifications</h3>
                    {notifications.length > 0 ? (
                      <span className="text-xs text-slate-500">{notifications.length} recent</span>
                    ) : null}
                  </div>
                  <div className="flex flex-col">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center">
                        <p className="text-sm text-slate-500">No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className="border-b border-slate-50 p-4 transition-colors last:border-0 hover:bg-slate-50"
                        >
                          {notif.title ? <p className="mb-1 text-sm font-bold text-slate-900">{notif.title}</p> : null}
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{notif.message}</p>
                          <p className="mt-2 text-xs font-medium text-slate-400">
                            {new Date(notif.created_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              Menu
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </section>

      <LogoutConfirmModal
        open={logoutOpen}
        busy={logoutBusy}
        onCancel={() => {
          if (!logoutBusy) setLogoutOpen(false)
        }}
        onConfirm={handleLogoutConfirm}
      />
    </main>
  )
}
