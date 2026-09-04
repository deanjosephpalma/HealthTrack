import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-semibold text-slate-600 shadow-sm">
        Rural Health Unit of Pila, Laguna
      </div>
    </div>
  )
}

export default function RoleProtectedRoute({ allowRoles, children }) {
  const { user, role, loading, profileLoading, profile } = useAuth()
  const location = useLocation()

  if (loading || profileLoading) {
    return <LoadingState />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!role || !allowRoles.includes(role)) {
    return <Navigate to="/login" replace />
  }

  const managerName = (import.meta.env.VITE_ACCOUNT_MANAGER_NAME || 'Alma Divinagracia').trim().toLowerCase()
  const managerEmail = (import.meta.env.VITE_ACCOUNT_MANAGER_EMAIL || '').trim().toLowerCase()
  const isAccountManager =
    (profile?.name || '').trim().toLowerCase() === managerName ||
    (managerEmail && (profile?.email || user?.email || '').trim().toLowerCase() === managerEmail)

  if (isAccountManager && location.pathname !== '/dashboard/accounts') {
    return <Navigate to="/dashboard/accounts" replace />
  }

  return children
}
