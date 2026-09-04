import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { isPatientEmailVerified } from '../lib/patientEmailVerified'

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-semibold text-slate-600 shadow-sm">
        Rural Health Unit of Pila, Laguna
      </div>
    </div>
  )
}

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingState />
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!isPatientEmailVerified(user)) {
    return (
      <Navigate
        to="/verify"
        replace
        state={{ userId: user.id, email: user.email }}
      />
    )
  }

  return children
}
