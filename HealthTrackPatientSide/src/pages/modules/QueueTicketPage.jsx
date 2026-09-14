import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import CancelEncodeConfirmModal from '../../components/CancelEncodeConfirmModal'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import { useAuth } from '../../context/useAuth'
import { cancelEncodeLine, enrollPatientInService, joinStaffLine } from '../../lib/patientServiceEnrollment'
import { resolvePatientPriority } from '../../lib/patientPriority'
import { supabase } from '../../lib/supabaseClient'
import { useOnlineStatus } from '../../lib/offline/connectivity'
import { listMyLocalTickets, countPendingOutbox } from '../../lib/offline/joinQueue'
import { startPatientAutoSync } from '../../lib/offline/syncEngine'

function queueStatusLabel(status) {
  const v = (status ?? 'waiting').toString().toLowerCase()
  if (v === 'next') return 'You are next'
  if (v === 'called') return 'Please proceed to MHO Office'
  if (v === 'skipped') return 'Skipped — wait to be recalled'
  if (v === 'completed' || v === 'done') return 'Completed'
  if (v === 'cancelled') return 'Cancelled'
  return 'Waiting in line'
}

function queueStatusClasses(status) {
  const v = (status ?? 'waiting').toString().toLowerCase()
  if (v === 'waiting') return 'bg-teal-50 text-teal-700 border-teal-200'
  if (v === 'next') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (v === 'called') return 'bg-purple-50 text-purple-700 border-purple-200'
  if (v === 'skipped') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (v === 'completed' || v === 'done') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

function labelOf(ticket) {
  if (ticket?.queue_label) return ticket.queue_label
  if (ticket?.queue_number) {
    return `${ticket.service_code || 'RHU'}-${String(ticket.queue_number).padStart(3, '0')}`
  }
  return '—'
}

export default function QueueTicketPage() {
  const { user, patient, enrollment, refreshEnrollment } = useAuth()
  const online = useOnlineStatus()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [joining, setJoining] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [pendingSync, setPendingSync] = useState(0)
  const [services, setServices] = useState([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
  const [serviceCleared, setServiceCleared] = useState(false)
  const [reason, setReason] = useState('')
  const [resolvedPatientId, setResolvedPatientId] = useState(enrollment?.patient_id ?? null)

  useEffect(() => {
    let cancelled = false
    const resolve = async () => {
      if (enrollment?.patient_id) {
        if (!cancelled) setResolvedPatientId(enrollment.patient_id)
        return
      }
      if (!user?.id) return
      const { data } = await supabase
        .from('patients')
        .select('id')
        .eq('patient_auth_id', user.id)
        .maybeSingle()
      if (!cancelled) setResolvedPatientId(data?.id ?? null)
    }
    void resolve()
    return () => {
      cancelled = true
    }
  }, [enrollment?.patient_id, user?.id])

  const patientId = resolvedPatientId
  const serviceName = enrollment?.service_types?.name ?? null
  const enrollmentStatus = (enrollment?.status ?? '').toString()
  const enrollmentPriority = resolvePatientPriority(enrollment?.intake_data || {})

  const activeTicket = useMemo(
    () =>
      tickets.find((t) =>
        ['waiting', 'next', 'called', 'skipped'].includes((t.status ?? '').toLowerCase()),
      ) ?? null,
    [tickets],
  )
  const ticketPriority = resolvePatientPriority(activeTicket || {})

  const awaitingStaff = enrollmentStatus === 'Awaiting Encoding'
  const encodedWaitingNumber = enrollmentStatus === 'Encoded'
  const canJoinStaffLine =
    !activeTicket &&
    !awaitingStaff &&
    !encodedWaitingNumber &&
    enrollmentStatus !== 'In Queue'

  const refresh = useCallback(
    async ({ soft = false } = {}) => {
      if (!user) return
      if (!soft) setLoading(true)
      setError('')
      try {
        const local = await listMyLocalTickets({
          patientId,
          patientAuthId: user.id,
        })
        setTickets(local)
        setPendingSync(await countPendingOutbox())
      } catch (e) {
        setError(e?.message || 'Failed to load tickets.')
      } finally {
        if (!soft) setLoading(false)
      }
    },
    [patientId, user],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!user) return undefined
    return startPatientAutoSync({
      patientId,
      patientAuthId: user.id,
      intervalMs: 15000,
      onAfterSync: () => {
        void refresh({ soft: true })
        void refreshEnrollment(user.id)
      },
    })
  }, [patientId, user, refresh, refreshEnrollment])

  useEffect(() => {
    let cancelled = false
    supabase
      .from('service_types')
      .select('id, name, queue_prefix')
      .order('name')
      .then(({ data, error: servicesError }) => {
        if (cancelled) return
        if (servicesError) {
          setError(servicesError.message || 'Failed to load services.')
          setServices([])
        } else {
          setServices(data ?? [])
        }
        setServicesLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e?.message || 'Failed to load services.')
        setServices([])
        setServicesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleServiceChange(e) {
    const serviceId = e.target.value
    if (!serviceId) {
      setMessage('')
      setError('')
      setServiceCleared(true)
      return
    }
    if (!user) return
    setServiceCleared(false)
    setEnrolling(true)
    setError('')
    setMessage('')
    try {
      const result = await enrollPatientInService(user.id, serviceId, {
        first_name: patient?.firstName || user?.user_metadata?.first_name,
        last_name: patient?.lastName || user?.user_metadata?.last_name,
        phone: patient?.phone || user?.user_metadata?.phone,
        email: user?.email,
      })
      if (!result.ok) {
        setError(result.error || 'Could not select service.')
        return
      }
      await refreshEnrollment(user.id)
      if (result.message) setMessage(result.message)
    } catch (err) {
      setError(err?.message || 'Could not select service.')
    } finally {
      setEnrolling(false)
    }
  }

  async function handleGetInLine(event) {
    event.preventDefault()
    if (!user) return
    if (!enrollment?.id || serviceCleared) {
      setError('Select a service first.')
      return
    }

    setJoining(true)
    setError('')
    setMessage('')
    try {
      const result = await joinStaffLine({
        serviceRequestId: enrollment.id,
        reason: reason.trim() || null,
      })
      if (!result.ok) {
        setError(result.error || 'Could not join the staff line.')
        return
      }
      await refreshEnrollment(user.id)
      setMessage(result.message || 'You are now in line for BHW / Volunteer encoding.')
      setReason('')
    } catch (e) {
      setError(e?.message || 'Failed to get in line.')
    } finally {
      setJoining(false)
    }
  }

  async function handleConfirmCancelEncodeLine() {
    if (!user || !enrollment?.id) return

    setCancelling(true)
    setError('')
    setMessage('')
    try {
      const result = await cancelEncodeLine({
        serviceRequestId: enrollment.id,
        patientAuthId: user.id,
      })
      if (!result.ok) {
        setError(result.error || 'Could not cancel.')
        await refreshEnrollment(user.id)
        return
      }
      setCancelModalOpen(false)
      await refreshEnrollment(user.id)
      setMessage(result.message || 'Encode line cancelled.')
    } catch (e) {
      setError(e?.message || 'Failed to cancel encode line.')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <section className="queue-page space-y-4">
      <div className="queue-sync-bar flex flex-wrap items-center justify-end gap-2">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
            online ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
          }`}
        >
          {online ? 'Online' : 'Offline'}
        </span>
        {pendingSync > 0 ? (
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
            {pendingSync} pending sync
          </span>
        ) : null}
      </div>

      <div className="queue-workspace patient-panel space-y-4">
        <div className="queue-flow-banner rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Flow today: choose a service → <strong>Get in line</strong> for BHW / Volunteer encoding → they encode your
          visit → they issue your queue number for the doctor or service counter.
        </div>

        <div className="queue-service-card rounded-2xl border border-slate-200 bg-white p-4">
          <label className="field-label" htmlFor="queue-service">
            Service
          </label>
          <select
            id="queue-service"
            className="field-input"
            aria-invalid={error === 'Select a service first.'}
            aria-describedby={error === 'Select a service first.' ? 'queue-service-error' : undefined}
            disabled={servicesLoading || enrolling || Boolean(activeTicket) || awaitingStaff || encodedWaitingNumber}
            value={serviceCleared ? '' : enrollment?.service_type_id || enrollment?.service_types?.id || ''}
            onChange={handleServiceChange}
          >
            <option value="">{servicesLoading ? 'Loading…' : 'Select a service'}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {error === 'Select a service first.' ? (
            <p id="queue-service-error" className="error-banner mt-2" role="alert">
              Select a service first.
            </p>
          ) : null}
          {serviceName && !serviceCleared ? <p className="mt-2 text-xs text-slate-500">Selected: {serviceName}</p> : null}
          {enrolling ? <p className="mt-2 text-xs text-slate-500">Switching service…</p> : null}
        </div>

        {activeTicket ? (
          <div className={`queue-ticket-hero rounded-2xl border p-5 ${queueStatusClasses(activeTicket.status)}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">Your ticket</p>
            <p className="queue-ticket-number mt-2 text-4xl font-bold">{labelOf(activeTicket)}</p>
            <p className="mt-2 text-sm font-semibold">{queueStatusLabel(activeTicket.status)}</p>
            {ticketPriority.isPriority ? (
              <p className="mt-2 text-sm font-semibold text-violet-800">Priority · {ticketPriority.label}</p>
            ) : null}
            <p className="mt-1 text-sm opacity-80">{activeTicket.reason}</p>
            {activeTicket.counter_room ? (
              <p className="mt-2 text-xs">Counter / Room: {activeTicket.counter_room}</p>
            ) : null}
          </div>
        ) : awaitingStaff ? (
          <div className="queue-state-panel rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">In encode line</p>
            <p className="mt-2 text-lg font-bold">Waiting for BHW / Volunteer encoding</p>
            {enrollmentPriority.isPriority ? (
              <p className="mt-2 rounded-lg bg-violet-100 px-3 py-2 text-sm font-semibold text-violet-900">
                Priority patient · {enrollmentPriority.label} — you will be encoded ahead of regular line.
              </p>
            ) : null}
            <p className="mt-2 text-sm">
              Please wait near the encode desk. After encoding, they will issue your queue number for{' '}
              {serviceName || 'your service'}.
            </p>
            <p className="mt-3 text-xs text-amber-800">
              Optional details:{' '}
              <Link className="font-semibold underline" to="/dashboard/service-intake">
                Service Info
              </Link>
            </p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              disabled={cancelling}
              onClick={() => setCancelModalOpen(true)}
            >
              Cancel encode line
            </button>
            <p className="mt-2 text-xs text-amber-800">
              You can cancel only while waiting for encoding. After staff encodes your visit, cancel is no longer
              available.
            </p>
          </div>
        ) : encodedWaitingNumber ? (
          <div className="queue-state-panel rounded-2xl border border-teal-200 bg-teal-50 p-5 text-teal-950">
            <p className="text-xs font-semibold uppercase tracking-[0.16em]">Encoded</p>
            <p className="mt-2 text-lg font-bold">Encoding finished</p>
            {enrollmentPriority.isPriority ? (
              <p className="mt-2 text-sm font-semibold text-violet-800">Priority · {enrollmentPriority.label}</p>
            ) : null}
            <p className="mt-2 text-sm">
              Please wait — BHW / Volunteer will press <strong>Get Queue Number</strong> and your ticket will appear
              here.
            </p>
          </div>
        ) : (
          <form onSubmit={handleGetInLine} className="queue-join-form space-y-3 rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
            <p className="text-sm font-semibold text-teal-900">Get in line for encoding</p>
            <p className="text-xs text-teal-800">
              You will not receive a queue number yet. A BHW or Volunteer encodes your visit first, then issues your
              number.
            </p>
            <div>
              <label className="field-label" htmlFor="queue-reason">
                Reason / complaint (optional)
              </label>
              <input
                id="queue-reason"
                className="field-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Fever, follow-up"
                disabled={!canJoinStaffLine}
              />
            </div>
            <button type="submit" className="patient-dash-btn-primary" disabled={joining || !canJoinStaffLine}>
              {joining ? 'Joining…' : 'Get in line'}
            </button>
          </form>
        )}

        {message ? <p className="info-banner">{message}</p> : null}
        {error && error !== 'Select a service first.' ? <p className="error-banner">{error}</p> : null}
        {loading ? <p className="info-banner">Loading your tickets…</p> : null}

        {!loading && tickets.length === 0 && !activeTicket && !awaitingStaff && !encodedWaitingNumber ? (
          <ModuleEmptyState
            title="Not in line yet"
            description="Select a service and tap Get in line when you arrive at the RHU."
          />
        ) : null}

        {tickets.length > 0 ? (
          <div className="queue-history space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Recent tickets</p>
            {tickets.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{labelOf(t)}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${queueStatusClasses(t.status)}`}>
                    {queueStatusLabel(t.status)}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{t.reason}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <CancelEncodeConfirmModal
        open={cancelModalOpen}
        serviceName={serviceName || 'this service'}
        variant="encode"
        busy={cancelling}
        onCancel={() => {
          if (!cancelling) setCancelModalOpen(false)
        }}
        onConfirm={() => void handleConfirmCancelEncodeLine()}
      />
    </section>
  )
}
