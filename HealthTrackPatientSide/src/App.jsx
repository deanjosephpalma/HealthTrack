import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion as Motion, useReducedMotion } from 'framer-motion'
import ProtectedRoute from './components/ProtectedRoute'
import PatientDashboardLayout from './components/PatientDashboardLayout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import VerifyPage from './pages/VerifyPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import QueueTicketPage from './pages/modules/QueueTicketPage'
import PatientMedicalRecordsPage from './pages/modules/MedicalRecordsPage'
import ProfilePage from './pages/modules/ProfilePage'
import ServiceIntakePage from './pages/modules/ServiceIntakePage'
import ServiceStatusPage from './pages/modules/ServiceStatusPage'
import PatientFollowUpsPage from './pages/modules/PatientFollowUpsPage'

function RouteFallback() {
  return <p className="info-banner">Loading...</p>
}

function AnimatedPage({ children }) {
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.34, ease: [0.22, 1, 0.36, 1] }

  return (
    <Motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
      transition={transition}
    >
      {children}
    </Motion.div>
  )
}

function PublicRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<AnimatedPage><LandingPage /></AnimatedPage>} />
        <Route path="/login" element={<AnimatedPage><LoginPage /></AnimatedPage>} />
        <Route path="/register" element={<AnimatedPage><RegisterPage /></AnimatedPage>} />
        <Route path="/verify" element={<AnimatedPage><VerifyPage /></AnimatedPage>} />
        <Route path="/auth/callback" element={<AnimatedPage><AuthCallbackPage /></AnimatedPage>} />
        <Route path="/reset-password" element={<AnimatedPage><ResetPasswordPage /></AnimatedPage>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <PatientDashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="service-intake" element={<ServiceIntakePage />} />
        <Route path="queue" element={<QueueTicketPage />} />
        <Route path="follow-ups" element={<PatientFollowUpsPage />} />
        <Route path="appointments" element={<Navigate to="/dashboard/queue" replace />} />
        <Route path="medical-records" element={<PatientMedicalRecordsPage />} />
        <Route path="service-status" element={<ServiceStatusPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="/*" element={<PublicRoutes />} />
    </Routes>
  )
}
