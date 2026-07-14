import { useEffect, useMemo, useState } from 'react'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import { logAuditEvent, supabase } from '../../lib/supabaseClient'
import { useConfirm } from '../../context/ConfirmContext'

const RETENTION_DAYS = 30

const formatValue = (value) => {
  const text = (value ?? '').toString().trim()
  return text ? text : '—'
}

const formatPatientNumber = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return String(Math.trunc(num)).padStart(4, '0')
}

const daysUntilDelete = (archivedAtIso) => {
  const archivedAt = archivedAtIso ? new Date(archivedAtIso) : null
  if (!archivedAt || Number.isNaN(archivedAt.getTime())) return null
  const ms = Date.now() - archivedAt.getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  const left = RETENTION_DAYS - days
  return left >= 0 ? left : 0
}

function UnarchiveIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" />
      <path d="M21 3H3v5h18V3z" />
      <path d="M12 12v5" />
      <path d="M9 14l3-3 3 3" />
    </svg>
  )
}

export default function ArchivePage() {
  const { confirm } = useConfirm()
  const [tab, setTab] = useState('patients')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoadingId, setActionLoadingId] = useState(null)
  const [patients, setPatients] = useState([])
  const [appointments, setAppointments] = useState([])
  const [queueItems, setQueueItems] = useState([])
  const [records, setRecords] = useState([])
  const [workflows, setWorkflows] = useState([])

  useEffect(() => {
    let isMounted = true

    const load = async () => {
      setLoading(true)
      setError('')

      const [patientsResult, appointmentsResult, queueResult, recordsResult, workflowsResult] = await Promise.all([
        supabase
          .from('patients')
          .select('id, name, patient_number, email, phone, archived_at')
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false }),
        supabase
          .from('appointments')
          .select('id, patient_name, appointment_date, status, reason, archived_at, patient_id, patients(patient_number)')
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false }),
        supabase
          .from('queue')
          .select('id, queue_number, patient_name, reason, status, archived_at, patient_id')
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false }),
        supabase
          .from('patient_records')
          .select('id, patient_name, diagnosis, date_of_consultation, notes, archived_at, patient_id')
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false }),
        supabase
          .from('service_requests')
          .select(`
            id, reference_number, current_status, archived_at, patient_id,
            patients (name, patient_number),
            service_types (name, queue_prefix)
          `)
          .not('archived_at', 'is', null)
          .order('archived_at', { ascending: false }),
      ])

      if (!isMounted) return

      const combinedError = [
        patientsResult.error?.message,
        appointmentsResult.error?.message,
        queueResult.error?.message,
        recordsResult.error?.message,
        workflowsResult.error?.message,
      ]
        .filter(Boolean)
        .join(' | ')
      if (combinedError) {
        setError(combinedError)
      }

      setPatients(patientsResult.data ?? [])
      setAppointments(appointmentsResult.data ?? [])
      setQueueItems(queueResult.data ?? [])
      setRecords(recordsResult.data ?? [])
      setWorkflows(workflowsResult.data ?? [])
      setLoading(false)
    }

    load()

    return () => {
      isMounted = false
    }
  }, [])

  const handleUnarchive = async ({ kind, id }) => {
    const confirmed = await confirm({
      title: 'Restore Archived Item',
      message:
        kind === 'patients'
          ? 'Restore this patient? Their archived consult records will also return to Patient Records.'
          : 'Unarchive this item? It will be restored back to the active list.',
      confirmLabel: 'Restore',
      cancelLabel: 'Cancel',
      type: 'info',
    })
    if (!confirmed) return

    setError('')
    setActionLoadingId(id)
    try {
      const restorePatch = { archived_at: null, archived_by: null }

      if (kind === 'patients') {
        const { error: patientError } = await supabase.from('patients').update(restorePatch).eq('id', id)
        if (patientError) throw new Error(patientError.message)

        await Promise.all([
          supabase.from('patient_records').update(restorePatch).eq('patient_id', id).not('archived_at', 'is', null),
          supabase.from('queue').update(restorePatch).eq('patient_id', id).not('archived_at', 'is', null),
          supabase.from('appointments').update(restorePatch).eq('patient_id', id).not('archived_at', 'is', null),
          supabase.from('service_requests').update(restorePatch).eq('patient_id', id).not('archived_at', 'is', null),
        ])

        void logAuditEvent({
          action: 'patient_unarchive',
          entityType: 'patients',
          entityId: id,
          metadata: {},
        })

        setPatients((prev) => prev.filter((row) => row.id !== id))
        // Refresh related local lists so restored child rows disappear from archive view.
        setRecords((prev) => prev.filter((row) => row.patient_id !== id))
        setAppointments((prev) => prev.filter((row) => row.patient_id !== id))
        setQueueItems((prev) => prev.filter((row) => row.patient_id !== id))
        setWorkflows((prev) => prev.filter((row) => row.patient_id !== id))
        return
      }

      const table =
        kind === 'appointments'
          ? 'appointments'
          : kind === 'queue'
            ? 'queue'
            : kind === 'records'
              ? 'patient_records'
              : kind === 'workflows'
                ? 'service_requests'
                : null
      if (!table) {
        throw new Error('Invalid archive type.')
      }

      const { error: updateError } = await supabase.from(table).update(restorePatch).eq('id', id)
      if (updateError) {
        throw new Error(updateError.message)
      }

      void logAuditEvent({
        action: `${kind}_unarchive`,
        entityType: table,
        entityId: id,
        metadata: {},
      })

      if (kind === 'appointments') {
        setAppointments((prev) => prev.filter((row) => row.id !== id))
      } else if (kind === 'queue') {
        setQueueItems((prev) => prev.filter((row) => row.id !== id))
      } else if (kind === 'workflows') {
        setWorkflows((prev) => prev.filter((row) => row.id !== id))
      } else {
        setRecords((prev) => prev.filter((row) => row.id !== id))
      }
    } catch (e) {
      setError(e?.message || 'Failed to unarchive item.')
    } finally {
      setActionLoadingId(null)
    }
  }

  const counts = useMemo(
    () => ({
      patients: patients.length,
      appointments: appointments.length,
      queue: queueItems.length,
      records: records.length,
      workflows: workflows.length,
    }),
    [patients.length, appointments.length, queueItems.length, records.length, workflows.length],
  )

  return (
    <section className="module-card">
      <h2 className="module-title">Archive</h2>
      <p className="module-subtitle">Archived items are kept for {RETENTION_DAYS} days before being deleted permanently.</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={tab === 'patients' ? 'secondary-btn' : 'secondary-btn bg-slate-200 text-slate-900 hover:bg-slate-300'}
          onClick={() => setTab('patients')}
        >
          Patients ({counts.patients})
        </button>
        <button
          type="button"
          className={tab === 'appointments' ? 'secondary-btn' : 'secondary-btn bg-slate-200 text-slate-900 hover:bg-slate-300'}
          onClick={() => setTab('appointments')}
        >
          Appointments ({counts.appointments})
        </button>
        <button
          type="button"
          className={tab === 'queue' ? 'secondary-btn' : 'secondary-btn bg-slate-200 text-slate-900 hover:bg-slate-300'}
          onClick={() => setTab('queue')}
        >
          Queue ({counts.queue})
        </button>
        <button
          type="button"
          className={tab === 'records' ? 'secondary-btn' : 'secondary-btn bg-slate-200 text-slate-900 hover:bg-slate-300'}
          onClick={() => setTab('records')}
        >
          Patient Records ({counts.records})
        </button>
        <button
          type="button"
          className={tab === 'workflows' ? 'secondary-btn' : 'secondary-btn bg-slate-200 text-slate-900 hover:bg-slate-300'}
          onClick={() => setTab('workflows')}
        >
          Workflows ({counts.workflows})
        </button>
      </div>

      {loading && <p className="info-banner mt-4">Loading archive...</p>}
      {error && <p className="error-banner mt-4">Archive error: {error}</p>}

      {!loading && !error ? (
        <div className="mt-6 space-y-3">
          {tab === 'patients' ? (
            patients.length === 0 ? (
              <ModuleEmptyState title="No archived patients" description="Archived patient profiles will appear here." />
            ) : (
              patients.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {item.patient_number ? (
                        <p className="chip mb-2">Patient ID - {formatPatientNumber(item.patient_number)}</p>
                      ) : null}
                      <h3 className="text-lg font-semibold text-slate-900">{formatValue(item.name)}</h3>
                      {item.email ? <p className="text-sm text-slate-600">{item.email}</p> : null}
                      {item.phone ? <p className="text-sm text-slate-600">{item.phone}</p> : null}
                    </div>
                    <button
                      type="button"
                      className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-200 text-slate-900 hover:bg-slate-300 disabled:opacity-50"
                      onClick={() => handleUnarchive({ kind: 'patients', id: item.id })}
                      disabled={actionLoadingId === item.id}
                      aria-label="Unarchive"
                      title="Restore patient"
                      aria-busy={actionLoadingId === item.id}
                    >
                      <UnarchiveIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Archived: {formatValue(item.archived_at)} • Deletes in {formatValue(daysUntilDelete(item.archived_at))}
                    {daysUntilDelete(item.archived_at) === 1 ? ' day' : ' days'}
                  </p>
                </article>
              ))
            )
          ) : null}

          {tab === 'appointments' ? (
            appointments.length === 0 ? (
              <ModuleEmptyState title="No archived appointments" description="Archived appointment items will appear here." />
            ) : (
              appointments.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                  {item.patients?.patient_number ? (
                    <p className="chip mb-2">Patient ID - {formatPatientNumber(item.patients.patient_number)}</p>
                  ) : null}
                  <h3 className="text-lg font-semibold text-slate-900">{formatValue(item.patient_name)}</h3>
                  <p className="text-sm text-slate-600">{formatValue(item.appointment_date)}</p>
                  <p className="text-sm text-slate-600">Status: {formatValue(item.status)}</p>
                  {item.reason ? <p className="mt-1 text-sm text-slate-700">{item.reason}</p> : null}
                    </div>
                    <button
                      type="button"
                      className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-200 text-slate-900 hover:bg-slate-300 disabled:opacity-50"
                      onClick={() => handleUnarchive({ kind: 'appointments', id: item.id })}
                      disabled={actionLoadingId === item.id}
                      aria-label="Unarchive"
                      title="Unarchive"
                      aria-busy={actionLoadingId === item.id}
                    >
                      <UnarchiveIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Archived: {formatValue(item.archived_at)} • Deletes in {formatValue(daysUntilDelete(item.archived_at))}
                    {daysUntilDelete(item.archived_at) === 1 ? ' day' : ' days'}
                  </p>
                </article>
              ))
            )
          ) : null}

          {tab === 'queue' ? (
            queueItems.length === 0 ? (
              <ModuleEmptyState title="No archived queue entries" description="Archived queue items will appear here." />
            ) : (
              queueItems.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {item.queue_number ? `#${item.queue_number} • ` : ''}
                        {formatValue(item.patient_name)}
                      </h3>
                      <p className="text-sm text-slate-600">{formatValue(item.reason)}</p>
                      <p className="text-sm text-slate-600">Status: {formatValue(item.status)}</p>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-200 text-slate-900 hover:bg-slate-300 disabled:opacity-50"
                      onClick={() => handleUnarchive({ kind: 'queue', id: item.id })}
                      disabled={actionLoadingId === item.id}
                      aria-label="Unarchive"
                      title="Unarchive"
                      aria-busy={actionLoadingId === item.id}
                    >
                      <UnarchiveIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Archived: {formatValue(item.archived_at)} • Deletes in {formatValue(daysUntilDelete(item.archived_at))}
                    {daysUntilDelete(item.archived_at) === 1 ? ' day' : ' days'}
                  </p>
                </article>
              ))
            )
          ) : null}

          {tab === 'records' ? (
            records.length === 0 ? (
              <ModuleEmptyState title="No archived patient records" description="Archived patient record items will appear here." />
            ) : (
              records.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-slate-900">{formatValue(item.patient_name)}</h3>
                      <p className="text-sm text-slate-600">{formatValue(item.date_of_consultation)}</p>
                      <p className="mt-1 text-sm text-slate-700">{formatValue(item.diagnosis)}</p>
                      {item.notes ? <p className="mt-1 text-sm text-slate-600">{item.notes}</p> : null}
                    </div>
                    <button
                      type="button"
                      className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-200 text-slate-900 hover:bg-slate-300 disabled:opacity-50"
                      onClick={() => handleUnarchive({ kind: 'records', id: item.id })}
                      disabled={actionLoadingId === item.id}
                      aria-label="Unarchive"
                      title="Unarchive"
                      aria-busy={actionLoadingId === item.id}
                    >
                      <UnarchiveIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Archived: {formatValue(item.archived_at)} • Deletes in {formatValue(daysUntilDelete(item.archived_at))}
                    {daysUntilDelete(item.archived_at) === 1 ? ' day' : ' days'}
                  </p>
                </article>
              ))
            )
          ) : null}

          {tab === 'workflows' ? (
            workflows.length === 0 ? (
              <ModuleEmptyState title="No archived workflows" description="Archived service workflows will appear here." />
            ) : (
              workflows.map((item) => (
                <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {item.patients?.patient_number ? (
                        <p className="chip mb-2">Patient ID - {formatPatientNumber(item.patients.patient_number)}</p>
                      ) : null}
                      <h3 className="text-lg font-semibold text-slate-900">
                        {formatValue(item.patients?.name)}
                      </h3>
                      <p className="text-sm text-slate-600">
                        {item.service_types?.queue_prefix ? `${item.service_types.queue_prefix} • ` : ''}
                        {formatValue(item.service_types?.name)}
                      </p>
                      <p className="text-sm text-slate-600 font-mono">{formatValue(item.reference_number)}</p>
                      <p className="text-sm text-slate-600">Status: {formatValue(item.current_status)}</p>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-200 text-slate-900 hover:bg-slate-300 disabled:opacity-50"
                      onClick={() => handleUnarchive({ kind: 'workflows', id: item.id })}
                      disabled={actionLoadingId === item.id}
                      aria-label="Unarchive"
                      title="Unarchive"
                      aria-busy={actionLoadingId === item.id}
                    >
                      <UnarchiveIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Archived: {formatValue(item.archived_at)} • Deletes in {formatValue(daysUntilDelete(item.archived_at))}
                    {daysUntilDelete(item.archived_at) === 1 ? ' day' : ' days'}
                  </p>
                </article>
              ))
            )
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
