import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { saveEnrollmentIntake } from '../../lib/patientServiceEnrollment'
import { supabase } from '../../lib/supabaseClient'
import { isOnline } from '../../lib/offline/connectivity'
import { getCharterByCode } from '../../config/citizenCharter'
import { resolveCharterKeyFromServiceName } from '../../lib/resolveCharterService'
import AnimalBiteLegacyForm from '../../components/AnimalBiteLegacyForm'
import TbLegacyForm from '../../components/TbLegacyForm'
import CharterServiceForm from '../../components/CharterServiceForm'
import OfflineDocumentsPanel from '../../components/OfflineDocumentsPanel'

function validateCharterForm(charter, data) {
  if (!charter?.intakeFields?.length) return null
  for (const field of charter.intakeFields) {
    if (!field.required) continue
    const value = data[field.name]
    if (field.type === 'checkbox_group') {
      if (!Array.isArray(value) || value.length === 0) {
        return `Please select at least one option for ${field.label}.`
      }
      continue
    }
    if (value == null || String(value).trim() === '') {
      return `${field.label} is required.`
    }
  }
  return null
}

export default function ServiceIntakePage() {
  const navigate = useNavigate()
  const { enrollment, refreshEnrollment, patchEnrollment, user } = useAuth()

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [legacyForm, setLegacyForm] = useState({})
  const [charterForm, setCharterForm] = useState({})
  const [loadingExisting, setLoadingExisting] = useState(true)

  const service = enrollment?.service_types
  const serviceName = service?.name || ''

  const charterKey = useMemo(() => resolveCharterKeyFromServiceName(serviceName), [serviceName])
  const charter = charterKey ? getCharterByCode(charterKey) : null

  const isAnimalBite = charterKey === 'animal_bite_anti_rabies'
  const isTb = charterKey === 'tuberculosis_treatment_services'
  const isPaperLogbook = isAnimalBite || isTb
  const isCharterIntake = Boolean(charter?.intakeFields?.length) && !isPaperLogbook

  useEffect(() => {
    let cancelled = false
    async function loadExisting() {
      if (!enrollment?.id) {
        setLoadingExisting(false)
        return
      }
      setLoadingExisting(true)

      // Prefer intake_data on service_requests when present
      const { data: sr } = await supabase
        .from('service_requests')
        .select('intake_data')
        .eq('id', enrollment.id)
        .maybeSingle()

      if (!cancelled && sr?.intake_data && typeof sr.intake_data === 'object') {
        if (isPaperLogbook) setLegacyForm(sr.intake_data)
        else setCharterForm(sr.intake_data)
      }
      if (!cancelled) setLoadingExisting(false)
    }
    void loadExisting()
    return () => {
      cancelled = true
    }
  }, [enrollment?.id, isPaperLogbook])

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

    if (isPaperLogbook) {
      setSubmitting(true)
      try {
        const result = await saveEnrollmentIntake(enrollment.id, legacyForm, null)
        if (!result.ok) throw new Error(result.error || 'Failed to save')
        await patchEnrollment({
          status: 'Ready',
          intake_data: legacyForm,
          updated_at: new Date().toISOString(),
          ...(result.enrollment || {}),
        })
        if (isOnline()) await refreshEnrollment(user?.id)
        navigate('/dashboard/queue', { replace: true })
      } catch (err) {
        setError('Failed to save information: ' + (err?.message || String(err)))
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (isCharterIntake) {
      const validationError = validateCharterForm(charter, charterForm)
      if (validationError) {
        setError(validationError)
        return
      }
      setSubmitting(true)
      try {
        const result = await saveEnrollmentIntake(enrollment.id, charterForm, null)
        if (!result.ok) throw new Error(result.error || 'Failed to save')
        await patchEnrollment({
          status: 'Ready',
          intake_data: charterForm,
          updated_at: new Date().toISOString(),
          ...(result.enrollment || {}),
        })
        if (isOnline()) await refreshEnrollment(user?.id)
        navigate('/dashboard/queue', { replace: true })
      } catch (err) {
        setError('Failed to save information: ' + (err?.message || String(err)))
      } finally {
        setSubmitting(false)
      }
      return
    }

    // No form needed — mark ready and go to queue
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
    return <div className="p-8 text-center text-slate-500">Loading form…</div>
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-teal-200/70 bg-teal-50/40 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Selected service</p>
        <p className="mt-1 text-lg font-bold text-slate-900">{serviceName || 'RHU Service'}</p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        {isAnimalBite ? (
          <div className="patient-form-card !p-0 overflow-hidden">
            <div className="p-4 sm:p-6">
              <AnimalBiteLegacyForm data={legacyForm} onChange={setLegacyForm} />
            </div>
          </div>
        ) : null}

        {isTb ? (
          <div className="patient-form-card !p-0 overflow-hidden">
            <div className="p-4 sm:p-6">
              <TbLegacyForm data={legacyForm} onChange={setLegacyForm} />
            </div>
          </div>
        ) : null}

        {isCharterIntake ? (
          <CharterServiceForm
            serviceName={serviceName}
            charterKey={charterKey}
            data={charterForm}
            onChange={setCharterForm}
          />
        ) : null}

        {!isPaperLogbook && !isCharterIntake ? (
          <div className="patient-form-card">
            <p className="text-sm text-slate-700">
              No additional intake form is required for this service. Continue to get a queue number.
            </p>
          </div>
        ) : null}

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
            {submitting ? 'Saving…' : 'Save & continue to queue'}
          </button>
          <Link to="/dashboard" className="secondary-btn !mt-0">
            Back to dashboard
          </Link>
        </div>
      </form>
    </section>
  )
}
