import { useCallback, useEffect, useState } from 'react'
import { logAuditEvent, supabase } from '../../lib/supabaseClient'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import { useAuth } from '../../context/useAuth'
import { useConfirm } from '../../context/ConfirmContext'
import { useOnlineStatus } from '../../lib/offline/connectivity'
import {
  createWalkIn,
  listLocalQueue,
  updateQueueStatusLocal,
  archiveQueueLocal,
  countPendingOutbox,
} from '../../lib/offline/queueService'
import { startAutoSync, syncNow, subscribeSyncStatus } from '../../lib/offline/syncEngine'

const formatPatientNumber = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return String(Math.trunc(num)).padStart(4, '0')
}

function ArchiveIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" />
      <path d="M21 3H3v5h18V3z" />
      <path d="M10 12h4" />
    </svg>
  )
}

function queueStatusLabel(status) {
  const v = (status ?? 'waiting').toString().toLowerCase()
  if (v === 'next') return 'Next'
  if (v === 'called') return 'Called'
  if (v === 'skipped') return 'Skipped'
  if (v === 'completed') return 'Completed'
  if (v === 'done') return 'Done'
  if (v === 'cancelled') return 'Cancelled'
  return 'Waiting'
}

function queueStatusClasses(status) {
  const v = (status ?? 'waiting').toString().toLowerCase()
  if (v === 'waiting') return 'bg-teal-50 text-teal-700'
  if (v === 'next') return 'bg-blue-50 text-blue-700'
  if (v === 'called') return 'bg-purple-50 text-purple-700'
  if (v === 'skipped') return 'bg-amber-50 text-amber-700'
  if (v === 'completed' || v === 'done') return 'bg-emerald-50 text-emerald-700'
  if (v === 'cancelled') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-700'
}

function queueLabelOf(item) {
  if (item.queue_label) return item.queue_label
  const prefix = item.service_code || 'RHU'
  if (item.queue_number) return `${prefix}-${String(item.queue_number).padStart(3, '0')}`
  return null
}

export default function QueuePage() {
  const { user } = useAuth()
  const { confirm } = useConfirm()
  const online = useOnlineStatus()
  const [queueItems, setQueueItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [services, setServices] = useState([])

  const [walkInOpen, setWalkInOpen] = useState(false)
  const [walkInName, setWalkInName] = useState('')
  const [walkInPhone, setWalkInPhone] = useState('')
  const [walkInReason, setWalkInReason] = useState('')
  const [walkInServiceId, setWalkInServiceId] = useState('')
  const [walkInSubmitting, setWalkInSubmitting] = useState(false)
  const [walkInMessage, setWalkInMessage] = useState('')

  const refreshLocal = useCallback(async () => {
    const rows = await listLocalQueue()
    setQueueItems(rows)
    setPendingCount(await countPendingOutbox())
    setLoading(false)
  }, [])

  useEffect(() => {
    let stop = () => {}
    const boot = async () => {
      setLoading(true)
      await refreshLocal()
      stop = startAutoSync({ intervalMs: 15000 })
    }
    void boot()

    const unsub = subscribeSyncStatus((status) => {
      setSyncing(Boolean(status.syncing))
      if (typeof status.pending === 'number') setPendingCount(status.pending)
      if (status.ok !== false) void refreshLocal()
    })

    return () => {
      stop()
      unsub()
    }
  }, [refreshLocal])

  useEffect(() => {
    const loadServices = async () => {
      const { data } = await supabase
        .from('services')
        .select('id, name, queue_prefix')
        .order('name', { ascending: true })
      if (Array.isArray(data) && data.length > 0) {
        setServices(data)
        setWalkInServiceId(data[0].id)
        return
      }
      const { data: types } = await supabase
        .from('service_types')
        .select('id, name, queue_prefix')
        .order('name', { ascending: true })
      const mapped = (types ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        queue_prefix: t.queue_prefix || 'RHU',
      }))
      setServices(mapped)
      if (mapped[0]) setWalkInServiceId(mapped[0].id)
    }
    void loadServices()
  }, [])

  const handleStatusAction = async (item, newStatus) => {
    setActionLoadingId(item.id)
    setError('')
    try {
      await updateQueueStatusLocal(item, newStatus)
      void logAuditEvent({
        action: `queue_${newStatus}`,
        entityType: 'queue',
        entityId: item.id,
        metadata: { status: newStatus, offline: !online },
      })
      await refreshLocal()
      if (online) void syncNow().then(() => refreshLocal())
    } catch (e) {
      setError(e?.message || 'Failed to update queue status.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const handleArchive = async (item) => {
    const confirmed = await confirm({
      title: 'Archive Queue Entry',
      message: 'Archive this queue entry? It will be deleted after 30 days.',
      confirmLabel: 'Archive',
      cancelLabel: 'Cancel',
      type: 'warning',
    })
    if (!confirmed) return

    try {
      await archiveQueueLocal(item, user?.id ?? null)
      void logAuditEvent({
        action: 'queue_archive',
        entityType: 'queue',
        entityId: item.id,
        metadata: { status: item.status ?? null },
      })
      await refreshLocal()
      if (online) void syncNow().then(() => refreshLocal())
    } catch (e) {
      setError(e?.message || 'Failed to archive.')
    }
  }

  const handleWalkIn = async (event) => {
    event.preventDefault()
    setWalkInSubmitting(true)
    setWalkInMessage('')
    setError('')
    try {
      const svc = services.find((s) => s.id === walkInServiceId)
      const { label } = await createWalkIn({
        patientName: walkInName,
        phoneNumber: walkInPhone || null,
        reason: walkInReason || 'Walk-in',
        serviceCode: svc?.queue_prefix || 'RHU',
        serviceName: svc?.name || '',
        serviceId: svc?.id || null,
        assignedStaffId: user?.id ?? null,
      })
      setWalkInMessage(`Ticket ${label} created.`)
      setWalkInName('')
      setWalkInPhone('')
      setWalkInReason('')
      setWalkInOpen(false)
      await refreshLocal()
      if (online) void syncNow().then(() => refreshLocal())
    } catch (e) {
      setError(e?.message || 'Failed to create walk-in ticket.')
    } finally {
      setWalkInSubmitting(false)
    }
  }

  const activeStatuses = ['waiting', 'next', 'called', 'skipped']
  const doneStatuses = ['done', 'cancelled', 'completed']

  const activeQueue = queueItems.filter((i) => activeStatuses.includes((i.status ?? '').toLowerCase()))
  const doneQueue = queueItems.filter((i) => doneStatuses.includes((i.status ?? '').toLowerCase()))

  const renderItem = (item) => {
    const status = (item.status ?? 'waiting').toString().toLowerCase()
    const isBusy = actionLoadingId === item.id
    const isDone = doneStatuses.includes(status)
    const queueLabel = queueLabelOf(item)

    return (
      <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {item.patient?.patient_number ? (
              <p className="chip mb-2">Patient ID - {formatPatientNumber(item.patient.patient_number)}</p>
            ) : null}
            <h3 className="text-lg font-semibold text-slate-900">
              {queueLabel ? <span className="mr-2 text-teal-700">{queueLabel}</span> : null}
              {item.patient_name}
            </h3>
            <p className="text-sm text-slate-600">{item.reason || 'No reason provided'}</p>
            {item.counter_room ? (
              <p className="mt-1 text-xs text-slate-500">Counter / Room: {item.counter_room}</p>
            ) : null}
            {item.estimated_waiting_time ? (
              <p className="text-xs text-slate-500">Est. wait: {item.estimated_waiting_time} min</p>
            ) : null}
            {item.phone_number ? <p className="text-xs text-slate-400">{item.phone_number}</p> : null}
            {item.pending_create || !item.synced ? (
              <p className="mt-1 text-xs font-semibold text-amber-700">Pending sync</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${queueStatusClasses(status)}`}>
              {queueStatusLabel(status)}
            </span>
            <button
              type="button"
              className="px-3 py-2 text-xs font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50"
              onClick={() => handleArchive(item)}
              disabled={!isDone}
              aria-label="Archive"
              title={isDone ? 'Archive' : 'Archive only after completion'}
            >
              <ArchiveIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!isDone ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
              onClick={() => handleStatusAction(item, 'next')}
              disabled={isBusy || status === 'next'}
            >
              {isBusy ? '...' : 'Next'}
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50"
              onClick={() => handleStatusAction(item, 'called')}
              disabled={isBusy || status === 'called'}
            >
              {isBusy ? '...' : 'Call'}
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50"
              onClick={() => handleStatusAction(item, 'skipped')}
              disabled={isBusy}
            >
              {isBusy ? '...' : 'Skip'}
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              onClick={() => handleStatusAction(item, 'completed')}
              disabled={isBusy}
            >
              {isBusy ? '...' : 'Complete'}
            </button>
          </div>
        ) : null}
      </article>
    )
  }

  return (
    <section className="module-card">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
      <h2 className="module-title">Queue Management</h2>
      <p className="module-subtitle">
        Walk-in queueing with offline support. Doctor-bound services (Animal Bite, OPD, Med Cert, TB) are reviewed under Doctor Consult.
      </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
              online ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {online ? 'Online' : 'Offline'}
          </span>
          {pendingCount > 0 ? (
            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {pendingCount} pending sync
            </span>
          ) : null}
          <button
            type="button"
            className="secondary-btn !mt-0 text-xs"
            disabled={!online || syncing}
            onClick={() => void syncNow().then(() => refreshLocal())}
          >
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button type="button" className="primary-btn !mt-0 text-xs" onClick={() => setWalkInOpen((v) => !v)}>
            {walkInOpen ? 'Close form' : 'Add walk-in'}
          </button>
        </div>
      </div>

      {walkInOpen ? (
        <form onSubmit={handleWalkIn} className="mb-5 space-y-3 rounded-2xl border border-teal-200 bg-teal-50/40 p-4">
          <p className="text-sm font-semibold text-teal-900">New walk-in ticket</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="walkin-name">
                Patient name
              </label>
              <input
                id="walkin-name"
                className="field-input"
                required
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="walkin-phone">
                Phone (optional)
              </label>
              <input
                id="walkin-phone"
                className="field-input"
                value={walkInPhone}
                onChange={(e) => setWalkInPhone(e.target.value)}
                placeholder="09xxxxxxxxx"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="walkin-service">
                Service
              </label>
              <select
                id="walkin-service"
                className="field-input"
                value={walkInServiceId}
                onChange={(e) => setWalkInServiceId(e.target.value)}
              >
                {services.length === 0 ? <option value="">Default (RHU)</option> : null}
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.queue_prefix || 'RHU'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="walkin-reason">
                Reason
              </label>
              <input
                id="walkin-reason"
                className="field-input"
                value={walkInReason}
                onChange={(e) => setWalkInReason(e.target.value)}
                placeholder="Chief complaint"
              />
            </div>
          </div>
          <button type="submit" className="primary-btn" disabled={walkInSubmitting}>
            {walkInSubmitting ? 'Creating…' : 'Issue ticket'}
          </button>
        </form>
      ) : null}

      {walkInMessage ? <p className="info-banner mb-4">{walkInMessage}</p> : null}
      {loading && <p className="info-banner mb-4">Loading queue data...</p>}
      {error && <p className="error-banner mb-4">Queue error: {error}</p>}

      {!loading && queueItems.length === 0 ? (
        <ModuleEmptyState
          title="No queue entries yet"
          description="Add a walk-in patient or wait for patients who join the queue from the patient portal."
        />
      ) : (
        <div className="space-y-6">
          {activeQueue.length > 0 ? (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Active Queue ({activeQueue.length})
              </p>
              <div className="space-y-3">{activeQueue.map(renderItem)}</div>
            </div>
          ) : null}

          {doneQueue.length > 0 ? (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Completed / Done ({doneQueue.length})
              </p>
              <div className="space-y-3 opacity-60">{doneQueue.map(renderItem)}</div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
