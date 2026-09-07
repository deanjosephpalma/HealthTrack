import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/useAuth'
import { supabase } from '../../lib/supabaseClient'
import CancelEncodeConfirmModal from '../../components/CancelEncodeConfirmModal'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import { fetchIssuedDocForServiceRequest } from '../../lib/issueDocuments'
import {
  documentTitleFromRow,
  downloadIssuedDocumentPdf,
  pdfPayloadFromCertificate,
  pdfPayloadFromPermit,
} from '../../lib/issuedDocumentPdf'

const STEP_ICONS = {
  registration: '📋',
  queue: '🔢',
  assessment: '🩺',
  vitals: '💉',
  vaccination: '💊',
  consultation: '👨‍⚕️',
  diagnosis: '📄',
  evaluation: '🔍',
  processing: '⚙️',
  approval: '✅',
  release: '📦',
  followup: '📅',
  scheduling: '🗓️',
  attendance: '🎓',
  submission: '📂',
  payment: '💳',
  examination: '🔬',
  completion: '🏁',
}

const HIDDEN_STATUSES = new Set(['cancelled', 'rejected'])

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
}

function resolveStatus(req) {
  return (req.status || req.current_status || 'pending').toString()
}

function statusLabel(raw) {
  const v = (raw ?? '').toString().toLowerCase()
  if (v === 'completed' || v === 'done') return 'Completed'
  if (v === 'in queue' || v === 'in_queue') return 'In Queue'
  if (v === 'in_progress' || v === 'for doctor' || v === 'doctor_in_progress') return 'In Progress'
  if (v === 'awaiting encoding') return 'Awaiting Encoding'
  if (v === 'encoded') return 'Encoded'
  if (v === 'ready') return 'Ready'
  if (v === 'draft') return 'Not started'
  if (v === 'cancelled') return 'Cancelled'
  if (v === 'rejected') return 'Rejected'
  if (v === 'pending' || v === 'active' || v === 'waiting') return 'Pending'
  return raw || 'Pending'
}

function statusClasses(raw) {
  const v = (raw ?? '').toString().toLowerCase()
  if (v === 'completed' || v === 'done') return 'bg-emerald-50 text-emerald-700'
  if (v === 'in queue' || v === 'in_queue') return 'bg-teal-50 text-teal-800'
  if (v === 'in_progress' || v === 'for doctor' || v === 'doctor_in_progress') return 'bg-blue-50 text-blue-700'
  if (v === 'awaiting encoding') return 'bg-amber-50 text-amber-800'
  if (v === 'encoded') return 'bg-teal-50 text-teal-800'
  if (v === 'ready') return 'bg-sky-50 text-sky-800'
  if (v === 'draft') return 'bg-amber-50 text-amber-800'
  if (v === 'cancelled' || v === 'rejected') return 'bg-rose-50 text-rose-700'
  return 'bg-slate-100 text-slate-600'
}

/** Unused / pre-encode enrollments the patient can cancel. */
function canDeleteRequest(req) {
  const v = resolveStatus(req).toLowerCase()
  if (['completed', 'done', 'in_progress', 'for doctor', 'doctor_in_progress', 'encoded'].includes(v)) return false
  if (['in queue', 'in_queue'].includes(v) || req.queue_id) return false
  return (
    ['draft', 'ready', 'pending', 'active', 'waiting', 'awaiting encoding', 'cancelled', 'rejected'].includes(v) || !v
  )
}

function QueuePositionBanner({ patientAuthId }) {
  const [queueEntry, setQueueEntry] = useState(null)
  const [ahead, setAhead] = useState(null)

  useEffect(() => {
    let isMounted = true

    const load = async () => {
      const { data: patient } = await supabase
        .from('patients')
        .select('id')
        .eq('patient_auth_id', patientAuthId)
        .maybeSingle()

      let queueData = null
      if (patient?.id) {
        const { data } = await supabase
          .from('queue')
          .select('id, queue_number, status, service_code, estimated_waiting_time, counter_room')
          .eq('patient_id', patient.id)
          .in('status', ['waiting', 'next', 'called', 'skipped'])
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        queueData = data
      }

      if (!queueData) {
        const { data: apptData } = await supabase
          .from('appointments')
          .select('queue_id')
          .eq('patient_auth_id', patientAuthId)
          .in('status', ['in_queue'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (apptData?.queue_id) {
          const { data } = await supabase
            .from('queue')
            .select('id, queue_number, status, service_code, estimated_waiting_time, counter_room')
            .eq('id', apptData.queue_id)
            .maybeSingle()
          queueData = data
        }
      }

      if (!isMounted) return
      if (!queueData) {
        setQueueEntry(null)
        return
      }
      setQueueEntry(queueData)

      if (queueData.service_code) {
        const { count } = await supabase
          .from('queue')
          .select('id', { count: 'exact', head: true })
          .eq('service_code', queueData.service_code)
          .lt('queue_number', queueData.queue_number)
          .in('status', ['waiting', 'next', 'called'])
          .is('archived_at', null)

        if (isMounted) setAhead(count ?? 0)
      }
    }

    load()
    const channel = supabase
      .channel('patient-queue-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue' }, load)
      .subscribe()

    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [patientAuthId])

  if (!queueEntry) return null

  const prefix = queueEntry.service_code ?? 'RHU'
  const label = `${prefix}-${String(queueEntry.queue_number).padStart(3, '0')}`
  const statusColor =
    queueEntry.status === 'called' || queueEntry.status === 'next'
      ? 'bg-amber-50 border-amber-200 text-amber-800'
      : 'bg-teal-50 border-teal-200 text-teal-800'

  return (
    <div className={`mb-4 rounded-2xl border p-4 ${statusColor}`}>
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest">Your Queue Number</p>
      <p className="text-3xl font-black tracking-wider">{label}</p>
      {ahead !== null && ahead > 0 && (
        <p className="mt-1 text-sm">
          <span className="font-semibold">{ahead}</span> patient{ahead !== 1 ? 's' : ''} ahead of you
        </p>
      )}
      {queueEntry.estimated_waiting_time ? (
        <p className="text-sm">
          Est. wait: <span className="font-semibold">{queueEntry.estimated_waiting_time} min</span>
        </p>
      ) : null}
      {(queueEntry.status === 'next' || queueEntry.status === 'called') && (
        <p className="mt-2 animate-pulse text-sm font-bold">
          You are being called! Please proceed to {queueEntry.counter_room || 'the clinic counter'}.
        </p>
      )}
    </div>
  )
}

export default function ServiceStatusPage() {
  const { user, patient, refreshEnrollment } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [info, setInfo] = useState('')
  const [issuedByRequestId, setIssuedByRequestId] = useState({})

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')

    const { data, error: err } = await supabase
      .from('service_requests')
      .select(`
        id, reference_number, current_step_index, current_status, status, queue_id, created_at, remarks,
        service_types (id, name, queue_prefix),
        service_request_steps (id, step_index, step_name, step_type, status, completed_at),
        appointments (id, appointment_date, preferred_schedule, phone_number)
      `)
      .eq('patient_auth_id', user.id)
      .order('created_at', { ascending: false })

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    const rows = data ?? []

    // Auto-cancel older unused Draft/Ready leftovers from service switching (keep newest only)
    const unused = rows.filter((r) => {
      const v = resolveStatus(r).toLowerCase()
      return ['draft', 'ready'].includes(v) && !r.queue_id
    })
    let visible
    if (unused.length > 1) {
      const keepId = unused[0].id
      const toCancel = unused.slice(1).map((r) => r.id)
      await supabase
        .from('service_requests')
        .update({ status: 'Cancelled', updated_at: new Date().toISOString() })
        .in('id', toCancel)
        .neq('id', keepId)

      const cleaned = rows.map((r) =>
        toCancel.includes(r.id) ? { ...r, status: 'Cancelled' } : r,
      )
      visible = cleaned.filter((r) => !HIDDEN_STATUSES.has(resolveStatus(r).toLowerCase()))
    } else {
      visible = rows.filter((r) => !HIDDEN_STATUSES.has(resolveStatus(r).toLowerCase()))
    }
    setRequests(visible)

    const completedIds = visible
      .filter((r) => ['completed', 'done'].includes(resolveStatus(r).toLowerCase()))
      .map((r) => r.id)
    const map = {}
    await Promise.all(
      completedIds.map(async (id) => {
        const doc = await fetchIssuedDocForServiceRequest(id)
        if (doc) map[id] = doc
      }),
    )
    setIssuedByRequestId(map)
    setLoading(false)
  }, [user])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)

    const channel = supabase
      .channel('patient-service-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_request_steps' }, load)
      .subscribe()

    return () => {
      window.clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [load])

  const handleDelete = async (req) => {
    if (!req?.id || !user) return
    const name = req.service_types?.name || 'this service'
    const isAwaitingEncoding = resolveStatus(req).toLowerCase() === 'awaiting encoding'

    setDeletingId(req.id)
    setError('')
    setInfo('')
    try {
      let updateQuery = supabase
        .from('service_requests')
        .update({ status: 'Cancelled', updated_at: new Date().toISOString() })
        .eq('id', req.id)
        .eq('patient_auth_id', user.id)

      if (isAwaitingEncoding) {
        updateQuery = updateQuery.eq('status', 'Awaiting Encoding')
      }

      const { data: updated, error: updateError } = await updateQuery.select('id').maybeSingle()

      if (updateError) throw new Error(updateError.message)
      if (isAwaitingEncoding && !updated) {
        throw new Error('Could not cancel — encoding may have already started. Refresh and try again.')
      }

      setPendingDelete(null)
      setRequests((prev) => prev.filter((r) => r.id !== req.id))
      setInfo(isAwaitingEncoding ? `Cancelled encode line for ${name}.` : `Removed ${name}.`)
      if (typeof refreshEnrollment === 'function') {
        await refreshEnrollment(user.id)
      }
    } catch (e) {
      setError(e?.message || 'Failed to remove service request.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="space-y-4">
      {user && <QueuePositionBanner patientAuthId={user.id} />}

      {loading && <p className="info-banner">Loading your service status...</p>}
      {error && <p className="error-banner">{error}</p>}
      {info && <p className="info-banner">{info}</p>}

      {!loading && requests.length === 0 ? (
        <ModuleEmptyState
          title="No active service requests"
          description="Select a service and join the queue — your request will appear here."
        />
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const steps = [...(req.service_request_steps ?? [])].sort((a, b) => a.step_index - b.step_index)
            const completedCount = steps.filter((s) => s.status === 'completed').length
            const totalSteps = steps.length
            const progress = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0
            const rawStatus = resolveStatus(req)
            const isDone = ['completed', 'done'].includes(rawStatus.toLowerCase())
            const prefix = req.service_types?.queue_prefix ?? 'RHU'
            const showDelete = canDeleteRequest(req)

            return (
              <article key={req.id} className="patient-panel !p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="mr-2 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-800">
                      {prefix}
                    </span>
                    <span className="font-mono text-xs text-slate-400">{req.reference_number}</span>
                    <p className="mt-1 font-semibold text-slate-900">{req.service_types?.name ?? 'RHU Service'}</p>
                    <p className="text-xs text-slate-500">{formatDate(req.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses(rawStatus)}`}>
                      {isDone ? '✓ Completed' : statusLabel(rawStatus)}
                    </span>
                    {showDelete ? (
                      <button
                        type="button"
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        disabled={deletingId === req.id}
                        onClick={() => setPendingDelete(req)}
                      >
                        {deletingId === req.id
                          ? 'Cancelling…'
                          : resolveStatus(req).toLowerCase() === 'awaiting encoding'
                            ? 'Cancel encode line'
                            : 'Remove'}
                      </button>
                    ) : null}
                  </div>
                </div>

                {totalSteps > 0 && (
                  <div className="mb-3">
                    <div className="mb-1 flex justify-between text-xs text-slate-500">
                      <span>Progress</span>
                      <span>
                        {completedCount}/{totalSteps} steps done
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-teal-600'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {steps.length > 0 ? (
                  <div className="space-y-1.5">
                    {steps.map((step) => {
                      const icon = STEP_ICONS[step.step_type] ?? '📌'
                      const isActive = step.status === 'in_progress'
                      const isDoneStep = step.status === 'completed'
                      return (
                        <div
                          key={step.id}
                          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                            isDoneStep
                              ? 'bg-emerald-50 text-emerald-700'
                              : isActive
                                ? 'bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-200'
                                : 'bg-slate-50 text-slate-400'
                          }`}
                        >
                          <span className="text-base">{icon}</span>
                          <span className="flex-1">{step.step_name}</span>
                          {isDoneStep && <span className="text-emerald-600">✓ Done</span>}
                          {isActive && <span className="animate-pulse text-blue-600">● Now</span>}
                        </div>
                      )
                    })}
                  </div>
                ) : showDelete ? (
                  <p className="text-xs text-slate-500">
                    {resolveStatus(req).toLowerCase() === 'awaiting encoding'
                      ? 'You are waiting for BHW / Volunteer encoding. You can cancel this line before encoding starts.'
                      : 'This service was selected but not used. You can remove it from your list.'}
                  </p>
                ) : null}

                {req.remarks ? (
                  <p className="mt-3 border-t border-slate-100 pt-3 text-xs italic text-slate-500">{req.remarks}</p>
                ) : null}

                {isDone ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                    {issuedByRequestId[req.id] ? (
                      <button
                        type="button"
                        className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                        onClick={() => {
                          const issued = issuedByRequestId[req.id]
                          const payload =
                            issued.kind === 'permit'
                              ? pdfPayloadFromPermit(issued.row, patient?.name || 'Patient')
                              : pdfPayloadFromCertificate(issued.row, patient?.name || 'Patient')
                          downloadIssuedDocumentPdf(payload)
                        }}
                      >
                        Download PDF — {documentTitleFromRow(issuedByRequestId[req.id].row)}
                      </button>
                    ) : null}
                    <Link
                      to="/dashboard/medical-records#permits-certificates"
                      className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100"
                    >
                      View in Medical Records
                    </Link>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      )}

      <CancelEncodeConfirmModal
        open={Boolean(pendingDelete)}
        serviceName={pendingDelete?.service_types?.name || 'this service'}
        variant={
          pendingDelete && resolveStatus(pendingDelete).toLowerCase() === 'awaiting encoding'
            ? 'encode'
            : 'unused'
        }
        busy={Boolean(deletingId)}
        onCancel={() => {
          if (!deletingId) setPendingDelete(null)
        }}
        onConfirm={() => {
          if (pendingDelete) void handleDelete(pendingDelete)
        }}
      />
    </section>
  )
}
