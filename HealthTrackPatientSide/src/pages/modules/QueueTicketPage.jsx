import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import { useAuth } from '../../context/useAuth'
import { enrollPatientInService } from '../../lib/patientServiceEnrollment'
import { supabase } from '../../lib/supabaseClient'
import { useOnlineStatus } from '../../lib/offline/connectivity'
import { joinQueue, listMyLocalTickets, countPendingOutbox } from '../../lib/offline/joinQueue'
import { startPatientAutoSync, syncPatientQueue } from '../../lib/offline/syncEngine'

function queueStatusLabel(status) {
  const v = (status ?? 'waiting').toString().toLowerCase()
  if (v === 'next') return 'You are next'
  if (v === 'called') return 'Please proceed to counter'
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
  const [pendingSync, setPendingSync] = useState(0)
  const [services, setServices] = useState([])
  const [servicesLoading, setServicesLoading] = useState(true)
  const [enrolling, setEnrolling] = useState(false)
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
  const serviceCode = enrollment?.service_types?.queue_prefix ?? 'RHU'
  const needsIntake = enrollment?.status === 'Draft'

  const activeTicket = useMemo(
    () =>
      tickets.find((t) =>
        ['waiting', 'next', 'called', 'skipped'].includes((t.status ?? '').toLowerCase()),
      ) ?? null,
    [tickets],
  )

  const canJoinQueue = Boolean(enrollment) && !activeTicket

  const refresh = useCallback(async ({ soft = false } = {}) => {
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
  }, [patientId, user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Auto-unlock stuck Draft enrollments when master profile is already complete
  useEffect(() => {
    let cancelled = false
    const promote = async () => {
      if (!user?.id || !enrollment?.id || enrollment.status !== 'Draft' || !online) return
      const { hasUsablePatientProfile } = await import('../../lib/patientServiceEnrollment')
      const ready = await hasUsablePatientProfile(enrollment.patient_id || patientId)
      if (!ready || cancelled) return
      await supabase
        .from('service_requests')
        .update({ status: 'Ready', updated_at: new Date().toISOString() })
        .eq('id', enrollment.id)
      if (!cancelled) await refreshEnrollment(user.id)
    }
    void promote()
    return () => {
      cancelled = true
    }
  }, [enrollment?.id, enrollment?.status, enrollment?.patient_id, patientId, online, user?.id, refreshEnrollment])

  useEffect(() => {
    if (!user) return undefined
    return startPatientAutoSync({
      patientId,
      patientAuthId: user.id,
      intervalMs: 15000,
      onAfterSync: () => {
        void refresh({ soft: true })
      },
    })
  }, [patientId, user, refresh])

  useEffect(() => {
    supabase
      .from('service_types')
      .select('id, name, queue_prefix')
      .order('name')
      .then(({ data }) => {
        setServices(data ?? [])
        setServicesLoading(false)
      })
  }, [])

  async function handleServiceChange(e) {
    const serviceId = e.target.value
    if (!serviceId || !user) return
    setEnrolling(true)
    setError('')
    const result = await enrollPatientInService(user.id, serviceId)
    if (!result.ok) {
      setError(result.error || 'Could not select service.')
    } else {
      await refreshEnrollment(user.id)
    }
    setEnrolling(false)
  }

  async function handleJoinQueue(event) {
    event.preventDefault()
    if (!user) return
    if (!enrollment) {
      setError('Select a service first.')
      return
    }
    if (!online && !user) {
      setError('Sign in while online first, then you can join offline.')
      return
    }

    setJoining(true)
    setError('')
    setMessage('')
    try {
      // Promote Draft → Ready when joining (master profile is enough for paperless queue)
      if (enrollment.status === 'Draft' && enrollment.id && online) {
        await supabase
          .from('service_requests')
          .update({ status: 'Ready', updated_at: new Date().toISOString() })
          .eq('id', enrollment.id)
        await refreshEnrollment(user.id)
      }

      const { label, alreadyJoined, syncWarning } = await joinQueue({
        patientName: patient?.name || user.email || 'Patient',
        patientId,
        patientAuthId: user.id,
        phoneNumber: patient?.phone || null,
        patientEmail: user.email || null,
        reason: reason || serviceName || 'Walk-in / self-join',
        serviceCode,
        serviceId: enrollment?.service_type_id || enrollment?.service_types?.id || null,
        serviceRequestId: enrollment?.id || null,
      })

      if (enrollment?.id && online) {
        await supabase
          .from('service_requests')
          .update({ status: 'In Queue', updated_at: new Date().toISOString() })
          .eq('id', enrollment.id)
        await refreshEnrollment(user.id)
      }

      setMessage(alreadyJoined ? `You already have ticket ${label}.` : `Joined queue — ticket ${label}.`)
      if (syncWarning) setError(syncWarning)
      setReason('')
      await refresh()
      if (online) {
        const syncResult = await syncPatientQueue({ patientId, patientAuthId: user.id })
        await refresh()
        if (!syncWarning && syncResult?.error && syncResult?.pending > 0) {
          setError(`Ticket saved locally but sync pending: ${syncResult.error}`)
        }
      }
    } catch (e) {
      setError(e?.message || 'Failed to join queue.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
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

      <div className="patient-panel space-y-4">
      {needsIntake ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          Optional: you can add more details in{' '}
          <Link className="font-semibold text-teal-800 underline" to="/dashboard/service-intake">
            Service Info
          </Link>
          . Your profile is enough to get a queue number.
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="field-label" htmlFor="queue-service">
          Service
        </label>
        <select
          id="queue-service"
          className="field-input"
          disabled={servicesLoading || enrolling || Boolean(activeTicket)}
          value={enrollment?.service_type_id || enrollment?.service_types?.id || ''}
          onChange={handleServiceChange}
        >
          <option value="">{servicesLoading ? 'Loading…' : 'Select a service'}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {serviceName ? <p className="mt-2 text-xs text-slate-500">Selected: {serviceName}</p> : null}
        {enrolling ? <p className="mt-2 text-xs text-slate-500">Switching service…</p> : null}
      </div>

      {activeTicket ? (
        <div className={`rounded-2xl border p-5 ${queueStatusClasses(activeTicket.status)}`}>
          <p className="text-xs font-semibold uppercase tracking-[0.16em]">Your ticket</p>
          <p className="mt-2 text-4xl font-bold">{labelOf(activeTicket)}</p>
          <p className="mt-2 text-sm font-semibold">{queueStatusLabel(activeTicket.status)}</p>
          <p className="mt-1 text-sm opacity-80">{activeTicket.reason}</p>
          {activeTicket.counter_room ? (
            <p className="mt-2 text-xs">Counter / Room: {activeTicket.counter_room}</p>
          ) : null}
          {activeTicket.pending_create || !activeTicket.synced ? (
            <p className="mt-2 text-xs font-semibold">Pending sync to RHU system</p>
          ) : null}
        </div>
      ) : (
        <form onSubmit={handleJoinQueue} className="space-y-3 rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
          <p className="text-sm font-semibold text-teal-900">Join today&apos;s queue</p>
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
              disabled={!canJoinQueue}
            />
          </div>
          <button
            type="submit"
            className="patient-dash-btn-primary"
            disabled={joining || !canJoinQueue}
          >
            {joining ? 'Joining…' : 'Get queue number'}
          </button>
        </form>
      )}

      {message ? <p className="info-banner">{message}</p> : null}
      {error ? <p className="error-banner">{error}</p> : null}
      {loading ? <p className="info-banner">Loading your tickets…</p> : null}

      {!loading && tickets.length === 0 && !activeTicket ? (
        <ModuleEmptyState
          title="No queue tickets yet"
          description="Select a service and join the queue when you arrive at the RHU."
        />
      ) : null}

      {tickets.length > 0 ? (
        <div className="space-y-2">
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
    </section>
  )
}
