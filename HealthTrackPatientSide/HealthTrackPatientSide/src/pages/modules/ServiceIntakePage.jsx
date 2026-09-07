import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { saveEnrollmentIntake } from '../../lib/patientServiceEnrollment'
import { isOnline } from '../../lib/offline/connectivity'
import { getCharterByCode } from '../../config/citizenCharter'
import { resolveCharterKeyFromServiceName } from '../../lib/resolveCharterService'
import OfflineDocumentsPanel from '../../components/OfflineDocumentsPanel'

function ServiceInformation({ serviceName, charter }) {
  const steps = charter?.steps || []
  const requirements = charter?.requirements || []

  return (
    <section className="patient-form-card space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Service information</p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">{charter?.title || serviceName || 'RHU Service'}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          RHU staff will encode the service details during your visit. Please review the information below and prepare the listed requirements.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Service fee</p>
          <p className="mt-2 text-sm font-semibold text-slate-800">{charter?.feeNote || 'To be advised by RHU staff'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Estimated processing</p>
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {steps.length ? `${steps.reduce((total, step) => total + (Number(step.minutes) || 0), 0)} minutes` : 'To be advised by RHU staff'}
          </p>
        </div>
      </div>

      {requirements.length ? (
        <div>
          <h3 className="text-sm font-bold text-slate-800">Requirements</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}
          </ul>
        </div>
      ) : null}

      {steps.length ? (
        <div>
          <h3 className="text-sm font-bold text-slate-800">Service process</h3>
          <ol className="mt-2 space-y-2 text-sm text-slate-600">
            {steps.map((step, index) => (
              <li key={`${step.label}-${index}`} className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">{index + 1}</span>
                <span><strong className="text-slate-800">{step.label}</strong> · {step.responsible}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  )
}

export default function ServiceIntakePage() {
  const navigate = useNavigate()
  const { enrollment, refreshEnrollment, patchEnrollment, user } = useAuth()

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadingExisting, setLoadingExisting] = useState(true)

  const service = enrollment?.service_types
  const serviceName = service?.name || ''

  const charterKey = useMemo(() => resolveCharterKeyFromServiceName(serviceName), [serviceName])
  const charter = charterKey ? getCharterByCode(charterKey) : null

  useEffect(() => {
    let cancelled = false
    async function loadExisting() {
      if (!enrollment?.id) {
        setLoadingExisting(false)
        return
      }
      setLoadingExisting(true)

      if (!cancelled) setLoadingExisting(false)
    }
    void loadExisting()
    return () => {
      cancelled = true
    }
  }, [enrollment?.id])

  useEffect(() => {
    if (enrollment && enrollment.status !== 'Draft' && enrollment.status !== 'Ready') {
      navigate('/dashboard/queue', { replace: true })
    }
  }, [enrollment, navigate])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    if (!enrollment?.id) {
      setError('No active service request found.')
      return
    }

    setSubmitting(true)
    try {
      const result = await saveEnrollmentIntake(enrollment.id, {}, null)
      if (!result.ok) throw new Error(result.error || 'Failed to continue')
      await patchEnrollment({
        status: 'Ready',
        updated_at: new Date().toISOString(),
        ...(result.enrollment || {}),
      })
      if (isOnline()) await refreshEnrollment(user?.id)
      navigate('/dashboard/queue', { replace: true })
    } catch (err) {
      setError(err?.message || 'Failed to continue.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!enrollment) {
    return (
      <section className="patient-panel">
        <p className="text-sm text-slate-600">Select a service on the homepage first, then return here after logging in.</p>
        <Link to="/" className="secondary-btn mt-4 inline-flex">
          Browse services
        </Link>
      </section>
    )
  }

  if (loadingExisting) {
    return <div className="p-8 text-center text-slate-500">Loading service information…</div>
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-teal-200/70 bg-teal-50/40 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Selected service</p>
        <p className="mt-1 text-lg font-bold text-slate-900">{serviceName || 'RHU Service'}</p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <ServiceInformation serviceName={serviceName} charter={charter} />

        {error ? <p className="error-banner">{error}</p> : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <OfflineDocumentsPanel
            serviceRequestId={enrollment?.id}
            patientAuthId={user?.id}
            title="Attach supporting documents (optional)"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="primary-btn !mt-0" disabled={submitting}>
            {submitting ? 'Continuing…' : 'Continue to queue'}
          </button>
          <Link to="/dashboard" className="secondary-btn !mt-0">
            Back to dashboard
          </Link>
        </div>
      </form>
    </section>
  )
}
