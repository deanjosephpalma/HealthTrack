import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import RoleProtectedRoute from './components/RoleProtectedRoute'
import DashboardLayout from './components/DashboardLayout'
import { ENCODER_ROLES, isEncoderRole, ROLES } from './config/rbac'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import NurseDashboardPage from './pages/NurseDashboardPage'
import BhwDashboardPage from './pages/BhwDashboardPage'
import PatientsPage from './pages/modules/PatientsPage'
import QueuePage from './pages/modules/QueuePage'
import DoctorConsultPage from './pages/modules/DoctorConsultPage'
import NurseServiceDeskPage from './pages/modules/NurseServiceDeskPage'
import StaffEncodeDeskPage from './pages/modules/StaffEncodeDeskPage'
import InventoryPage from './pages/modules/InventoryPage'
import ReportsPage from './pages/modules/ReportsPage'
import ArchivePage from './pages/modules/ArchivePage'
import WorkflowPage from './pages/modules/WorkflowPage'
import ServiceWorkflowPage from './pages/modules/ServiceWorkflowPage'
import FollowUpsPage from './pages/modules/FollowUpsPage'
import ReportedCasesPage from './pages/modules/ReportedCasesPage'
import AccountsPage from './pages/modules/AccountsPage'

import HistoricalDataEncoder from './pages/modules/HistoricalDataEncoder'

const HeatMapPage = lazy(() => import('./pages/modules/HeatMapPage'))

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 py-20">
      <p className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-semibold text-slate-600 shadow-sm">
        Rural Health Unit of Pila, Laguna
      </p>
    </div>
  )
}

function RootRedirect() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-semibold text-slate-600 shadow-sm">
          Rural Health Unit of Pila, Laguna
        </p>
      </div>
    )
  }

  return <Navigate to={user ? '/dashboard' : '/login'} replace />
}

function DashboardIndexRoute() {
  const { loading, profileLoading, role, profile, user } = useAuth()
  const managerName = (import.meta.env.VITE_ACCOUNT_MANAGER_NAME || 'Alma Divinagracia').trim().toLowerCase()
  const managerEmail = (import.meta.env.VITE_ACCOUNT_MANAGER_EMAIL || '').trim().toLowerCase()
  const isAccountManager =
    (profile?.name || '').trim().toLowerCase() === managerName ||
    (managerEmail && (profile?.email || user?.email || '').trim().toLowerCase() === managerEmail)

  if (loading || profileLoading) {
    return <RouteFallback />
  }

  if (isAccountManager) {
    return <Navigate to="/dashboard/accounts" replace />
  }

  if (role === ROLES.DOCTOR) {
    return <DashboardPage />
  }

  if (role === ROLES.NURSE) {
    return <NurseDashboardPage />
  }

  if (isEncoderRole(role)) {
    return <BhwDashboardPage />
  }

  console.error('Invalid role:', role, 'Expected Doctor, Nurse, BHW, or Volunteer')
  return <Navigate to="/login" replace />
}

function App() {
  const { user, role, loading, profileLoading } = useAuth()
  const isAuthorized = Boolean(user && role)

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route
        path="/login"
        element={loading || profileLoading ? <RouteFallback /> : isAuthorized ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardIndexRoute />} />
        <Route
          path="queue"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.DOCTOR, ROLES.NURSE]}>
              <QueuePage />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="staff-encode"
          element={
            <RoleProtectedRoute allowRoles={ENCODER_ROLES}>
              <StaffEncodeDeskPage />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="doctor-consult"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.DOCTOR]}>
              <DoctorConsultPage />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="nurse-service-desk"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.NURSE]}>
              <NurseServiceDeskPage />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="encode-record"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.DOCTOR, ROLES.NURSE]}>
              <HistoricalDataEncoder />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="patient-records"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.DOCTOR, ROLES.NURSE]}>
              <PatientsPage />
            </RoleProtectedRoute>
          }
        />
        <Route path="appointments" element={<Navigate to="/dashboard/queue" replace />} />
        <Route
          path="patients"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.DOCTOR, ROLES.NURSE]}>
              <Navigate to="/dashboard/patient-records" replace />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="medical-records"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.DOCTOR, ROLES.NURSE]}>
              <Navigate to="/dashboard/patient-records" replace />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="inventory"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.NURSE]}>
              <InventoryPage />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="workflow"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.NURSE]}>
              <WorkflowPage />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="service-workflow/:id"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.NURSE]}>
              <ServiceWorkflowPage />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="reported-cases"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.DOCTOR, ROLES.NURSE]}>
              <ReportedCasesPage />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="follow-ups"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.DOCTOR, ROLES.NURSE]}>
              <FollowUpsPage />
            </RoleProtectedRoute>
          }
        />

        <Route
          path="accounts"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.DOCTOR, ROLES.NURSE]}>
              <AccountsPage />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="heat-map"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.DOCTOR]}>
              <Suspense fallback={<RouteFallback />}>
                <HeatMapPage />
              </Suspense>
            </RoleProtectedRoute>
          }
        />
        <Route
          path="reports"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.NURSE]}>
              <ReportsPage />
            </RoleProtectedRoute>
          }
        />
        <Route
          path="archive"
          element={
            <RoleProtectedRoute allowRoles={[ROLES.NURSE]}>
              <ArchivePage />
            </RoleProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
