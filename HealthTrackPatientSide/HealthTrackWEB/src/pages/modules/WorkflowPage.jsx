import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { logAuditEvent, supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import { useConfirm } from '../../context/ConfirmContext'
import ModuleEmptyState from '../../components/ModuleEmptyState'

function ArchiveIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" />
      <path d="M21 3H3v5h18V3z" />
      <path d="M12 12v5" />
      <path d="M9 15l3 3 3-3" />
    </svg>
  )
}

const STATUS_COLORS = {
  pending: 'bg-slate-100 text-slate-600',
  in_progress: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  skipped: 'bg-amber-50 text-amber-700',
}

const STEP_TYPE_ICONS = {
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

function StepBadge({ step }) {
  const icon = STEP_TYPE_ICONS[step.step_type] ?? '📌'
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${STATUS_COLORS[step.status] ?? 'bg-slate-50 text-slate-500'}`}>
      <span>{icon}</span>
      <span>{step.step_name}</span>
      {step.status === 'completed' && <span className="ml-auto text-emerald-600">✓</span>}
      {step.status === 'in_progress' && <span className="ml-auto animate-pulse text-blue-600">●</span>}
    </div>
  )
}

export default function WorkflowPage() {
  const navigate = useNavigate()
  const { user, role } = useAuth()
  const { confirm } = useConfirm()
  const isDoctor = role === 'Doctor'
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionLoading, setActionLoading] = useState(null)
  const [filterStatus, setFilterStatus] = useState('active')
  const [filterService, setFilterService] = useState('all')
  const [serviceTypes, setServiceTypes] = useState([])

  const loadRequests = useCallback(async () => {
    setLoading(true)
    setError('')

    let query = supabase
      .from('service_requests')
      .select(`
        id, reference_number, current_step_index, current_status, created_at, remarks,
        service_types (id, name, queue_prefix),
        patients (id, name, patient_number),
        service_request_steps (id, step_index, step_name, step_type, assigned_to, status, notes, completed_at)
      `)
      .is('archived_at', null)
      .order('created_at', { ascending: false })

    if (filterStatus !== 'all') {
      query = query.in('current_status', filterStatus === 'active' ? ['pending', 'active', 'in_progress'] : [filterStatus])
    }

    const { data, error: err } = await query

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    let filtered = data ?? []
    if (filterService !== 'all') {
      filtered = filtered.filter((r) => r.service_types?.id === filterService)
    }

    setRequests(filtered)
    setLoading(false)
  }, [filterStatus, filterService])

  useEffect(() => {
    supabase.from('service_types').select('id, name, queue_prefix').then(({ data }) => {
      setServiceTypes(data ?? [])
    })
  }, [])

  useEffect(() => {
    void loadRequests()

    const channel = supabase
      .channel('workflow-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, loadRequests)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_request_steps' }, loadRequests)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [loadRequests])

  const handleArchive = async (request) => {
    const isActive = !['completed', 'cancelled'].includes(request.current_status)
    const confirmed = await confirm({
      title: 'Archive Workflow',
      message: isActive
        ? 'This workflow is still in progress. Archive it anyway? You can restore it from Archive within 30 days.'
        : 'Archive this workflow? It will move to Archive and be deleted permanently after 30 days.',
      confirmLabel: 'Archive',
      cancelLabel: 'Cancel',
      type: 'warning',
    })
    if (!confirmed) return

    setActionLoading(request.id)
    setActionError('')
    try {
      const { error: archiveError } = await supabase
        .from('service_requests')
        .update({
          archived_at: new Date().toISOString(),
          ...(user?.id ? { archived_by: user.id } : {}),
        })
        .eq('id', request.id)

      if (archiveError) {
        throw new Error(archiveError.message)
      }

      void logAuditEvent({
        action: 'workflow_archive',
        entityType: 'service_requests',
        entityId: request.id,
        metadata: {
          current_status: request.current_status ?? null,
          reference_number: request.reference_number ?? null,
        },
      })
      await loadRequests()
    } catch (e) {
      setActionError(e?.message || 'Failed to archive workflow.')
    } finally {
      setActionLoading(null)
    }
  }

  const getActiveStep = (req) => {
    const steps = req.service_request_steps ?? []
    return steps.find((s) => s.step_index === req.current_step_index) ?? null
  }

  const canOpenWorkflow = (step, isDone) => {
    if (isDone) return true
    if (!step) return true
    if (isDoctor) return step.assigned_to === 'doctor' || step.status === 'completed'
    return true
  }

  return (
    <section className="module-card">
      <h2 className="module-title">Workflow Management</h2>
      <p className="module-subtitle">
        Citizens Charter service workflows — open a request to complete intake forms and advance processing steps.
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          className="field-input w-auto text-sm"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All Statuses</option>
        </select>
        <select
          className="field-input w-auto text-sm"
          value={filterService}
          onChange={(e) => setFilterService(e.target.value)}
        >
          <option value="all">All Services</option>
          {serviceTypes.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="info-banner mb-4">Loading workflows...</p>}
      {error && <p className="error-banner mb-4">{error}</p>}
      {actionError && <p className="error-banner mb-4">{actionError}</p>}

      {!loading && requests.length === 0 ? (
        <ModuleEmptyState
          title="No service requests"
          description="Service requests appear here when patients check in and are added to the queue."
        />
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const steps = [...(req.service_request_steps ?? [])].sort((a, b) => a.step_index - b.step_index)
            const activeStep = getActiveStep(req)
            const isBusy = actionLoading === req.id
            const isDone = req.current_status === 'completed'
            const canOpen = canOpenWorkflow(activeStep, isDone)
            const prefix = req.service_types?.queue_prefix ?? 'RHU'

            return (
              <article key={req.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-teal-200 bg-teal-50 px-3 py-0.5 text-xs font-bold text-teal-800">
                        {prefix}
                      </span>
                      <span className="font-mono text-xs text-slate-500">{req.reference_number}</span>
                    </div>
                    <h3 className="mt-1 text-base font-semibold text-slate-900">{req.patients?.name ?? '—'}</h3>
                    <p className="text-xs text-slate-500">{req.service_types?.name ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        isDone
                          ? 'bg-emerald-50 text-emerald-700'
                          : req.current_status === 'in_progress'
                            ? 'bg-blue-50 text-blue-700'
                            : req.current_status === 'cancelled'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isDone
                        ? 'Completed'
                        : req.current_status === 'in_progress'
                          ? 'In Progress'
                          : req.current_status === 'cancelled'
                            ? 'Cancelled'
                            : 'Pending'}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-medium text-slate-900 hover:bg-slate-300 disabled:opacity-50"
                      onClick={() => handleArchive(req)}
                      disabled={isBusy}
                      aria-label="Archive"
                      title={isBusy ? 'Archiving...' : 'Archive'}
                      aria-busy={isBusy}
                    >
                      <ArchiveIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mb-3 space-y-1.5">
                  {steps.map((step) => (
                    <StepBadge key={step.id} step={step} />
                  ))}
                </div>

                {activeStep && !isDone && (
                  <p className="mb-3 text-xs text-slate-600">
                    <span className="font-semibold">Current step:</span> {activeStep.step_name}
                    {activeStep.assigned_to === 'doctor' && (
                      <span className="ml-2 rounded bg-purple-50 px-2 py-0.5 text-xs text-purple-700">Doctor</span>
                    )}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-medium text-white hover:bg-teal-600 disabled:opacity-50"
                    onClick={() => navigate(`/dashboard/service-workflow/${req.id}`)}
                    disabled={!canOpen || isBusy}
                  >
                    {isDone ? 'View workflow' : `Open: ${activeStep?.step_name ?? 'workflow'}`}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
