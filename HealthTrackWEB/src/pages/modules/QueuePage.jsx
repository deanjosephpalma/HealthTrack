import { useCallback, useEffect, useState } from 'react'
import { logAuditEvent } from '../../lib/supabaseClient'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import { useAuth } from '../../context/useAuth'
import { useConfirm } from '../../context/ConfirmContext'
import { useOnlineStatus } from '../../lib/offline/connectivity'
import {
  listLocalQueue,
  updateQueueStatusLocal,
  archiveQueueLocal,
  countPendingOutbox,
} from '../../lib/offline/queueService'
import { startAutoSync, syncNow, subscribeSyncStatus } from '../../lib/offline/syncEngine'
import { resolvePatientPriority, compareByPriorityThenArrival } from '../../lib/patientPriority'
import { nextQueueItem } from '../../lib/queueState'

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
  const refreshLocal = useCallback(async () => {
    const rows = await listLocalQueue()
    setQueueItems(rows)
    setPendingCount(await countPendingOutbox())
    setLoading(false)
  }, [])

  useEffect(() => {
    void refreshLocal()
    const unsub = subscribeSyncStatus((status) => {
      setSyncing(Boolean(status.syncing))
      if (typeof status.pending === 'number') setPendingCount(status.pending)
      if (status.error) setError(`Queue sync failed: ${status.error}`)
      else if (status.lastSyncAt) setError('')
      if (!status.syncing) void refreshLocal()
    })
    const stop = startAutoSync({ intervalMs: 15000 })

    return () => {
      stop()
      unsub()
    }
  }, [refreshLocal])

  const handleStatusAction = async (item, newStatus) => {
    setActionLoadingId(item.id)
    setError('')
    try {
      await updateQueueStatusLocal(item, newStatus, { autoAdvance: true })
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

  const activeStatuses = ['waiting', 'next', 'called', 'skipped']
  const doneStatuses = ['done', 'cancelled', 'completed']

  const activeQueue = queueItems
    .filter((i) => activeStatuses.includes((i.status ?? '').toLowerCase()))
    .slice()
    .sort(compareByPriorityThenArrival)
  const doneQueue = queueItems.filter((i) => doneStatuses.includes((i.status ?? '').toLowerCase()))
  const servingItem = activeQueue.find((item) => (item.status ?? '').toString().toLowerCase() === 'called') ?? null
  const nextItem = nextQueueItem(activeQueue)
  const waitingCount = activeQueue.filter((item) => (item.status ?? '').toString().toLowerCase() === 'waiting').length

  const renderItem = (item, index = 0, { showPosition = false } = {}) => {
    const status = (item.status ?? 'waiting').toString().toLowerCase()
    const isBusy = actionLoadingId !== null
    const isDone = doneStatuses.includes(status)
    const queueLabel = queueLabelOf(item)
    const priority = resolvePatientPriority(item)
    const isNext = showPosition && item.id === nextItem?.id
    const position = !showPosition ? '' : status === 'called' ? 'Serving' : isNext ? 'Next' : status === 'skipped' ? 'Skipped' : `#${index + 1}`

    return (
      <article
        key={item.id}
        className={`queue-entry rounded-2xl border p-4 ${
          isNext
              ? 'border-teal-400 bg-teal-50/40 ring-2 ring-teal-200'
              : priority.isPriority
                ? 'border-violet-300 bg-violet-50/50'
                : 'border-slate-200 bg-slate-50'
        }`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-1 gap-3">
            {showPosition ? (
              <div
                className={`queue-position flex h-14 w-16 shrink-0 flex-col items-center justify-center rounded-xl text-center ${
                  isNext ? 'bg-teal-700 text-white' : priority.isPriority ? 'bg-violet-100 text-violet-900' : 'bg-slate-200 text-slate-700'
                }`}
              >
                <span className="text-xs font-extrabold leading-tight">{position}</span>
              </div>
            ) : null}
            <div className="min-w-0">
              {item.patient?.patient_number ? (
                <p className="chip mb-2">Patient ID - {formatPatientNumber(item.patient.patient_number)}</p>
              ) : null}
              <h3 className="text-lg font-semibold text-slate-900">
                {queueLabel ? <span className="mr-2 text-teal-700">{queueLabel}</span> : null}
                {item.patient_name}
              </h3>
              <p className="text-sm text-slate-600">{item.reason || 'No reason provided'}</p>
              {priority.isPriority ? (
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-violet-800">
                  Priority · {priority.label}
                </p>
              ) : (
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Regular</p>
              )}
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
              className="queue-action queue-action-next px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
              onClick={() => handleStatusAction(item, 'next')}
              disabled={isBusy || status === 'next'}
            >
              {isBusy ? '...' : 'Next'}
            </button>
            <button
              type="button"
              className="queue-action queue-action-call px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50"
              onClick={() => handleStatusAction(item, 'called')}
              disabled={isBusy || status === 'called'}
            >
              {isBusy ? '...' : 'Call'}
            </button>
            <button
              type="button"
              className="queue-action queue-action-skip px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50"
              onClick={() => handleStatusAction(item, 'skipped')}
              disabled={isBusy}
            >
              {isBusy ? '...' : 'Skip'}
            </button>
            <button
              type="button"
              className="queue-action queue-action-complete px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
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
    <section className="queue-operations module-card">
      <div className="queue-page-header mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
      <h2 className="module-title">Queue Management</h2>
      <p className="module-subtitle">
        Queue management with offline support. Walk-in patients are encoded at the BHW / Volunteer Encode Desk. Doctor-bound services (Animal Bite, OPD, Med Cert, TB) are reviewed under Doctor Consult.
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

        </div>
      </div>

      <div className="queue-summary-grid mb-5" aria-label="Queue summary">
        <article className="queue-summary-card queue-summary-serving">
          <p className="queue-summary-label">Currently serving</p>
          <p className="queue-summary-value">{servingItem ? queueLabelOf(servingItem) || 'In service' : 'None'}</p>
          <p className="queue-summary-detail">{servingItem?.patient_name || 'No patient is currently called.'}</p>
        </article>
        <article className="queue-summary-card queue-summary-next">
          <p className="queue-summary-label">Next in line</p>
          <p className="queue-summary-value">{nextItem ? queueLabelOf(nextItem) || 'Next' : 'None'}</p>
          <p className="queue-summary-detail">{nextItem?.patient_name || 'Queue is clear.'}</p>
        </article>
        <article className="queue-summary-card">
          <p className="queue-summary-label">Waiting</p>
          <p className="queue-summary-value">{waitingCount}</p>
          <p className="queue-summary-detail">Active patient entries</p>
        </article>
        <article className="queue-summary-card">
          <p className="queue-summary-label">Completed</p>
          <p className="queue-summary-value">{doneQueue.length}</p>
          <p className="queue-summary-detail">Today&apos;s finished entries</p>
        </article>
      </div>

      {loading && <p className="info-banner mb-4">Loading queue data...</p>}
      {error && <p className="error-banner mb-4">Queue error: {error}</p>}

      {!loading && activeQueue.length === 0 && doneQueue.length === 0 ? (
        <ModuleEmptyState
          title="No queue entries yet"
          description="Patients appear here after encoding and queue number issuance at the BHW / Volunteer Encode Desk."
        />
      ) : (
        <div className="space-y-6">
          {activeQueue.length > 0 ? (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Active Queue — top is Next ({activeQueue.length})
              </p>
              <div className="queue-list space-y-3">
                {activeQueue.map((item, index) => renderItem(item, index, { showPosition: true }))}
              </div>
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
