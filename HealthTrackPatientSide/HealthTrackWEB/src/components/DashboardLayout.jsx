import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { MODULE_META, MODULES, getSidebarModules } from '../config/rbac'
import { useConfirm } from '../context/ConfirmContext'

function MenuIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
    </svg>
  )
}

function NavIcon({ name }) {
  const c = 'h-4 w-4'
  const icons = {
    grid: <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />,
    stethoscope: (
      <>
        <path d="M6 4v6a4 4 0 008 0V4" />
        <path d="M10 14v2a4 4 0 008 0v-1" />
        <circle cx="18" cy="15" r="2" />
      </>
    ),
    clipboard: (
      <>
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
        <path d="M9 5a2 2 0 012-2h2a2 2 0 012 2v0a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </>
    ),
    workflow: <path d="M7 7h4v4H7V7zm6 6h4v4h-4v-4zM9 11v2m6-6v2M9 17h6" />,
    queue: <path d="M4 6h16M4 12h16M4 18h10" />,
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 19a6 6 0 0112 0" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M15.5 19a4.5 4.5 0 015-4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 01-3.46 0" />
      </>
    ),
    box: <path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" />,
    archive: (
      <>
        <path d="M3 5h18v4H3V5z" />
        <path d="M5 9v10h14V9M10 13h4" />
      </>
    ),
    map: (
      <>
        <path d="M9 4l6 2 6-2v16l-6 2-6-2-6 2V6l6-2z" />
        <path d="M9 4v16M15 6v16" />
      </>
    ),
    chart: <path d="M4 19V5M4 19h16M8 16V10M12 16V7M16 16v-4" />,
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={c} aria-hidden="true">
      {icons[name] || icons.grid}
    </svg>
  )
}

const PAGE_COPY = {
  '/dashboard/queue': { kicker: 'Front desk', title: 'Queue', subtitle: 'Call patients and manage today’s line.' },
  '/dashboard/staff-encode': {
    kicker: 'BHW / Volunteer',
    title: 'Encode Desk',
    subtitle: 'Encode Get-in-line patients, then issue queue numbers.',
  },
  '/dashboard/doctor-consult': { kicker: 'Clinic', title: 'Doctor Consult', subtitle: 'AB, OPD, Medical Certificate, and TB consults.' },
  '/dashboard/nurse-service-desk': { kicker: 'Desk', title: 'Service Desk', subtitle: 'Permits, health cards, and nurse-handled services.' },
  '/dashboard/patient-records': { kicker: 'Records', title: 'Patient Records', subtitle: 'Paperless consult history and profiles.' },
  '/dashboard/follow-ups': { kicker: 'Care', title: 'Follow-ups', subtitle: 'Animal bite and TB monitoring schedules.' },
  '/dashboard/reported-cases': { kicker: 'Surveillance', title: 'Reported Cases', subtitle: 'Community and clinic case reports.' },
  '/dashboard/heat-map': { kicker: 'GIS', title: 'Heat Map', subtitle: 'ICD-10 doctor consults and reported cases by barangay.' },
  '/dashboard/workflow': { kicker: 'Process', title: 'Workflow', subtitle: 'Active service requests and steps.' },
  '/dashboard/inventory': { kicker: 'Supplies', title: 'Inventory', subtitle: 'Medicines and clinic stock.' },
  '/dashboard/reports': { kicker: 'Analytics', title: 'Reports', subtitle: 'Operational summaries for RHU Pila.' },
  '/dashboard/archive': { kicker: 'Storage', title: 'Archive', subtitle: 'Soft-deleted items kept for retention.' },
  '/dashboard/accounts': {
    kicker: 'Administration',
    title: 'Accounts',
    subtitle: 'Manage staff and patient account access.',
  },
}

export default function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, profile, role, signOut } = useAuth()
  const { confirm } = useConfirm()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const managerName = (import.meta.env.VITE_ACCOUNT_MANAGER_NAME || 'Alma Divinagracia').trim().toLowerCase()
  const managerEmail = (import.meta.env.VITE_ACCOUNT_MANAGER_EMAIL || '').trim().toLowerCase()
  const isAccountManager =
    (profile?.name || '').trim().toLowerCase() === managerName ||
    (managerEmail && (profile?.email || user?.email || '').trim().toLowerCase() === managerEmail)

  const menuItems = isAccountManager
    ? [MODULES.ACCOUNTS]
    : getSidebarModules(role).filter((moduleKey) => moduleKey !== MODULES.ACCOUNTS)
  const isHeatMapRoute = location.pathname.startsWith('/dashboard/heat-map')
  const isDashboardHome = location.pathname === '/dashboard'
  const pageMeta = PAGE_COPY[location.pathname] || null

  useEffect(() => {
    if (mobileNavOpen) setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileNavOpen) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [mobileNavOpen])

  const handleLogout = async () => {
    const ok = await confirm({
      type: 'warning',
      title: 'Sign out?',
      message:
        'You will be signed out of the staff console on this device. Unsynced offline work stays on this browser until you sign back in as the same user.',
      confirmLabel: 'Sign out',
      cancelLabel: 'Stay signed in',
    })
    if (!ok) return
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <main className="app-shell">
      <button
        type="button"
        className={`app-mobile-menu-btn lg:hidden ${isHeatMapRoute ? 'border-white/20 bg-slate-900/90 text-slate-100' : ''}`}
        onClick={() => setMobileNavOpen((open) => !open)}
        aria-expanded={mobileNavOpen}
        aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
      >
        <MenuIcon open={mobileNavOpen} />
        <span>Menu</span>
      </button>

      {mobileNavOpen ? (
        <button
          type="button"
          className="app-sidebar-backdrop lg:hidden"
          aria-label="Close navigation menu"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside className={`app-sidebar ${mobileNavOpen ? 'app-sidebar-open' : ''}`}>
        <div className="app-sidebar-inner">
          <div>
            <p className="chip">HealthTrack · RHU Pila</p>
            <h2 className="sidebar-title">Staff Console</h2>
            <p className="sidebar-subtitle">
              {role || 'Staff'} · {profile?.name || user?.email || 'Signed in'}
            </p>
          </div>

          <nav className="menu-list" aria-label="Dashboard modules">
            {menuItems.map((moduleKey) => {
              const item = MODULE_META[moduleKey]
              if (!item) return null
              return (
                <NavLink
                  key={moduleKey}
                  to={item.path}
                  end={item.path === '/dashboard'}
                  className={({ isActive }) => (isActive ? 'menu-link menu-link-active' : 'menu-link')}
                  onClick={() => setMobileNavOpen(false)}
                >
                  <span className="menu-link-icon">
                    <NavIcon name={item.icon} />
                  </span>
                  {item.label}
                </NavLink>
              )
            })}
          </nav>

          <button className="app-sidebar-logout" type="button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <section className={isHeatMapRoute ? 'app-main app-main-gis overflow-hidden relative' : 'app-main'}>
        {!isHeatMapRoute && !isDashboardHome && pageMeta ? (
          <header className="app-header">
            <div className="min-w-0">
              <p className="app-header-kicker">{pageMeta.kicker}</p>
              <h1 className="dashboard-title mt-1">{pageMeta.title}</h1>
              <p className="dashboard-subtitle mt-1">{pageMeta.subtitle}</p>
            </div>
          </header>
        ) : null}

        <Outlet />
      </section>
    </main>
  )
}
