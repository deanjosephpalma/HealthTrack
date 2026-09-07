import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import CharterServiceForm from '../../components/CharterServiceForm'
import PatientProfileView from '../../components/PatientProfileView'
import { useAuth } from '../../context/useAuth'
import { logAuditEvent, supabase } from '../../lib/supabaseClient'
import {
  documentTitleFromRow,
  fetchIssuedDocForServiceRequest,
  releaseIssuedDocument,
  resolveIssuedDocumentSpec,
} from '../../lib/issueDocuments'
import {
  downloadIssuedDocumentPdf,
  pdfPayloadFromCertificate,
  pdfPayloadFromPermit,
} from '../../lib/issuedDocumentPdf'
import { listLocalQueue, updateQueueStatusLocal, countPendingOutbox } from '../../lib/offline/queueService'
import { startAutoSync, syncNow } from '../../lib/offline/syncEngine'
import { useOnlineStatus } from '../../lib/offline/connectivity'
import { savePatientRecordLocal, enqueueServiceRequestUpdate } from '../../lib/offline/paperlessService'
import { queueLabelOf, mergeIntakeResponses } from '../../lib/doctorServices'
import {
  isNurseDeskQueueItem,
  nurseDeskKindLabel,
  resolveNurseDeskKind,
} from '../../lib/nurseServices'
import { resolveCharterKeyFromServiceName } from '../../lib/resolveCharterService'
import { resolvePatientPriority, compareByPriorityThenArrival } from '../../lib/patientPriority'

const ACTIVE = new Set(['waiting', 'next', 'called', 'skipped'])

function statusLabel(status) {
  const v = (status ?? 'waiting').toString().toLowerCase()
  if (v === 'next') return 'Next'
  if (v === 'called') return 'Called'
  if (v === 'skipped') return 'Skipped'
  return 'Waiting'
}

function statusClasses(status) {
  const v = (status ?? 'waiting').toString().toLowerCase()
  if (v === 'called') return 'bg-purple-50 text-purple-700 border-purple-200'
  if (v === 'next') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (v === 'skipped') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-teal-50 text-teal-700 border-teal-200'
}

export default function NurseServiceDeskPage() {
  const { user } = useAuth()
  const online = useOnlineStatus()
  const [queueItems, setQueueItems] = useState([])
  const [serviceNameById, setServiceNameById] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingSync, setPendingSync] = useState(0)

  const [selectedId, setSelectedId] = useState(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [intakeData, setIntakeData] = useState({})
  const [serviceRequest, setServiceRequest] = useState(null)
  const [existingRecord, setExistingRecord] = useState(null)
  const [actionNotes, setActionNotes] = useState('')
  const [outcome, setOutcome] = useState('Released / completed')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [patientAuthId, setPatientAuthId] = useState(null)
  const [patientEmail, setPatientEmail] = useState(null)
  const [patientProfile, setPatientProfile] = useState(null)
  const [showPatientInfo, setShowPatientInfo] = useState(false)
  const [issuedDoc, setIssuedDoc] = useState(null)

  const refreshQueue = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (online) await syncNow()
      const rows = await listLocalQueue()
      setQueueItems(rows)
      setPendingSync(await countPendingOutbox())
    } catch (e) {
      setError(e?.message || 'Failed to load nurse desk queue.')
    } finally {
      setLoading(false)
    }
  }, [online])

  useEffect(() => {
    void refreshQueue()
    const stop = startAutoSync({ intervalMs: 15000 })
    return () => stop()
  }, [refreshQueue])

  useEffect(() => {
    const loadNames = async () => {
      const map = new Map()
      const { data: services } = await supabase.from('services').select('id, name, queue_prefix')
      for (const s of services ?? []) {
        map.set(s.id, s.name)
        if (s.queue_prefix) map.set(`prefix:${s.queue_prefix}`, s.name)
      }
      const { data: types } = await supabase.from('service_types').select('id, name, queue_prefix')
      for (const s of types ?? []) {
        if (!map.has(s.id)) map.set(s.id, s.name)
      }
      setServiceNameById(map)
    }
    void loadNames()
  }, [])

  const deskQueue = useMemo(() => {
    return queueItems
      .filter((item) => ACTIVE.has((item.status ?? '').toLowerCase()))
      .filter((item) => isNurseDeskQueueItem(item, serviceNameById))
      .slice()
      .sort((a, b) => {
        const rank = (s) => {
          const v = (s ?? '').toLowerCase()
          if (v === 'called') return 0
          if (v === 'next') return 1
          if (v === 'waiting') return 2
          return 3
        }
        const d = rank(a.status) - rank(b.status)
        if (d !== 0) return d
        return compareByPriorityThenArrival(a, b)
      })
  }, [queueItems, serviceNameById])

  const selected = useMemo(
    () => deskQueue.find((q) => q.id === selectedId) ?? null,
    [deskQueue, selectedId],
  )

  const serviceKind = useMemo(() => {
    if (!selected) return null
    const name = selected.service_name || serviceNameById.get(selected.service_id) || ''
    return resolveNurseDeskKind({ serviceCode: selected.service_code, serviceName: name })
  }, [selected, serviceNameById])

  const serviceDisplayName = useMemo(() => {
    if (!selected) return ''
    return selected.service_name || serviceNameById.get(selected.service_id) || nurseDeskKindLabel(serviceKind)
  }, [selected, serviceNameById, serviceKind])

  const charterKey = useMemo(
    () => resolveCharterKeyFromServiceName(serviceDisplayName),
    [serviceDisplayName],
  )

  const openCase = async (item) => {
    setSelectedId(item.id)
    setPanelLoading(true)
    setSaveMessage('')
    setError('')
    setActionNotes('')
    setOutcome('Released / completed')
    setIntakeData({})
    setServiceRequest(null)
    setExistingRecord(null)
    setPatientAuthId(null)
    setPatientEmail(null)
    setPatientProfile(null)
    setShowPatientInfo(false)
    setIssuedDoc(null)

    try {
      // Keep Waiting until staff taps Call — do not auto-call on open
      if (online && item.patient_id) {
        const { data: patientRow } = await supabase.from('patients').select('*').eq('id', item.patient_id).maybeSingle()
        if (patientRow) {
          setPatientProfile(patientRow)
          setPatientAuthId(patientRow.patient_auth_id ?? null)
          setPatientEmail(patientRow.email || null)
        }
      }

      if (online) {
        let sr = null
        const { data: byQueue } = await supabase
          .from('service_requests')
          .select('id, status, patient_id, service_id, service_type_id, queue_id, reference_number, patient_auth_id, intake_data')
          .eq('queue_id', item.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        sr = byQueue

        if (!sr && item.patient_id) {
          const { data: byPatient } = await supabase
            .from('service_requests')
            .select('id, status, patient_id, service_id, service_type_id, queue_id, reference_number, patient_auth_id, intake_data')
            .eq('patient_id', item.patient_id)
            .not('status', 'in', '(Cancelled,Rejected,Completed)')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          sr = byPatient
        }

        if (sr) {
          setServiceRequest(sr)
          if (sr.patient_auth_id) setPatientAuthId(sr.patient_auth_id)
          if (sr.intake_data && typeof sr.intake_data === 'object') {
            setIntakeData(sr.intake_data)
          } else {
            const { data: responses } = await supabase
              .from('form_responses')
              .select('response_data, workflow_step_id')
              .eq('service_request_id', sr.id)
            setIntakeData(mergeIntakeResponses(responses ?? []))
          }
        }

        const { data: record } = await supabase
          .from('patient_records')
          .select('*')
          .eq('queue_id', item.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (record) {
          setExistingRecord(record)
          setActionNotes(record.notes ?? '')
          setOutcome(
            (record.notes || '').match(/^Nurse desk outcome:\s*(.+)$/m)?.[1]?.trim()
              || 'Released / completed',
          )
        }

        if (sr?.id) {
          const existing = await fetchIssuedDocForServiceRequest(sr.id)
          if (existing) setIssuedDoc(existing)
        }
      }
    } catch (e) {
      setError(e?.message || 'Failed to load case.')
    } finally {
      setPanelLoading(false)
    }
  }

  const callPatient = async () => {
    if (!selected) return
    const status = (selected.status ?? '').toLowerCase()
    if (status === 'called') return
    setError('')
    try {
      await updateQueueStatusLocal(selected, 'called')
      if (online) await syncNow()
      await refreshQueue()
    } catch (e) {
      setError(e?.message || 'Failed to call patient.')
    }
  }

  const handleComplete = async (event) => {
    event.preventDefault()
    if (!selected) return
    const notesText = actionNotes.trim()
    const outcomeText = outcome.trim() || 'Released / completed'

    setSaving(true)
    setError('')
    setSaveMessage('')
    const nowIso = new Date().toISOString()

    try {
      let resolvedAuthId = patientAuthId ?? serviceRequest?.patient_auth_id ?? patientProfile?.patient_auth_id ?? null
      let resolvedPatientId = selected.patient_id ?? serviceRequest?.patient_id ?? patientProfile?.id ?? null
      if (online && !resolvedAuthId && resolvedPatientId) {
        const { data: linked } = await supabase
          .from('patients')
          .select('id, patient_auth_id, email')
          .eq('id', resolvedPatientId)
          .maybeSingle()
        if (linked?.patient_auth_id) resolvedAuthId = linked.patient_auth_id
      }

      const outcomeLine = `Nurse desk outcome: ${outcomeText}`
      const mergedNotes = notesText ? `${outcomeLine}\n\n${notesText}` : outcomeLine

      const recordPayload = {
        patient_name: selected.patient_name,
        // Doctor-only column — never set by Nurse (DB trigger enforces)
        diagnosis: null,
        notes: mergedNotes,
        queue_id: selected.id,
        patient_id: resolvedPatientId,
        patient_auth_id: resolvedAuthId,
        workflow_status: 'completed',
        nurse_completed_at: nowIso,
        date_of_consultation: nowIso.slice(0, 10),
      }

      const docSpec = resolveIssuedDocumentSpec({
        serviceKind,
        serviceName: serviceDisplayName,
        intakeData,
      })
      if (docSpec?.title && (!outcomeText || outcomeText === 'Released / completed')) {
        recordPayload.notes = `Nurse desk outcome: ${docSpec.title} released${notesText ? `\n\n${notesText}` : ''}`
      }

      const carry = [
        'first_name',
        'middle_name',
        'last_name',
        'birthdate',
        'sex',
        'age',
        'civil_status',
        'blood_type',
        'mobile_phone',
        'barangay',
        'house_no_purok',
        'municipality',
        'province',
      ]
      const profileSource = { ...(patientProfile || {}), ...intakeData }
      for (const key of carry) {
        if (profileSource[key] != null && profileSource[key] !== '') recordPayload[key] = profileSource[key]
      }

      const recordId = existingRecord?.id ?? crypto.randomUUID()
      const { offline: recordOffline } = await savePatientRecordLocal({
        ...recordPayload,
        id: recordId,
      })

      await updateQueueStatusLocal(selected, 'completed')

      if (serviceRequest?.id) {
        const statusPatch = { status: 'Completed', updated_at: nowIso }
        if (online) {
          await supabase.from('service_requests').update(statusPatch).eq('id', serviceRequest.id)
        } else {
          await enqueueServiceRequestUpdate(serviceRequest.id, statusPatch)
        }
      }

      let released = null
      if (online && serviceKind) {
        if (!resolvedPatientId) {
          setSaveMessage(
            'Service completed, but certificate was not stored — patient profile link is missing. Re-link the patient and re-release, or run the certificates migration.',
          )
        } else {
          released = await releaseIssuedDocument({
            serviceKind,
            serviceName: serviceDisplayName,
            patientId: resolvedPatientId,
            serviceRequestId: serviceRequest?.id ?? null,
            issuedBy: user?.id ?? null,
            outcome: outcomeText,
            notes: notesText,
            intakeData,
            applicantName: selected.patient_name,
          })
          if (released?.ok && released.row) {
            setIssuedDoc({
              kind: released.table === 'permits' ? 'permit' : 'certificate',
              row: released.row,
            })
          } else if (released && !released.ok) {
            console.warn('releaseIssuedDocument failed:', released.error)
          }
        }
      }

      if (online) await syncNow()

      void logAuditEvent({
        action: 'nurse_complete_desk_service',
        entityType: 'patient_records',
        entityId: recordId,
        metadata: {
          queue_id: selected.id,
          service_kind: serviceKind,
          service_code: selected.service_code ?? null,
          issued_document: released?.ok
            ? { table: released.table, id: released.row?.id, title: released.title }
            : { error: released?.error || (resolvedPatientId ? null : 'missing_patient_id') },
          offline: recordOffline,
        },
      })

      setSaveMessage(
        recordOffline
          ? 'Saved offline. Will sync when you reconnect.'
          : released?.ok
            ? `${released.title || 'Document'} released. Patient can download it from Medical Records.`
            : released && !released.ok
              ? `Service completed, but certificate insert failed: ${released.error}. Run certificates_permits_patient_rls.sql in Supabase.`
              : 'Service completed. Patient record updated and ticket closed.',
      )
      setSelectedId(null)
      setExistingRecord(null)
      setServiceRequest(null)
      setIssuedDoc(null)
      await refreshQueue()
    } catch (e) {
      setError(e?.message || 'Failed to complete service.')
    } finally {
      setSaving(false)
    }
  }

  const downloadIssuedPdf = () => {
    if (!issuedDoc?.row) return
    const name = selected?.patient_name || patientProfile?.name || 'Patient'
    const base =
      issuedDoc.kind === 'permit'
        ? pdfPayloadFromPermit(issuedDoc.row, name)
        : pdfPayloadFromCertificate(issuedDoc.row, name)
    const mergedDetails = {
      ...(base.details || {}),
      ...(intakeData && typeof intakeData === 'object' ? intakeData : {}),
    }
    downloadIssuedDocumentPdf({
      ...base,
      details: mergedDetails,
      patientDetails: {
        age:
          patientProfile?.age ??
          intakeData.applicant_age ??
          intakeData.age ??
          null,
        sex: patientProfile?.sex ?? intakeData.applicant_sex ?? intakeData.sex,
        birthdate: patientProfile?.birthdate ?? intakeData.birthdate,
        barangay: patientProfile?.barangay ?? intakeData.barangay,
        house_no_purok: patientProfile?.house_no_purok ?? intakeData.house_no_purok,
        municipality: patientProfile?.municipality ?? 'Pila',
        province: patientProfile?.province ?? 'Laguna',
      },
    })
  }

  return (
    <section className="module-card space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="module-title">Nurse Service Desk</h2>
          <p className="module-subtitle">
            Permits, health cards, death certificate review, and pre-marriage counseling — processed by nurse/staff (not Doctor Consult). Medical Certificate stays with the doctor.
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
          {pendingSync > 0 ? (
            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {pendingSync} pending sync
            </span>
          ) : null}
          <Link to="/dashboard/queue" className="secondary-btn !mt-0 text-xs">
            Full Queue
          </Link>
          <button type="button" className="secondary-btn !mt-0 text-xs" onClick={() => void refreshQueue()}>
            Refresh
          </button>
        </div>
      </div>

      {error ? <p className="error-banner">{error}</p> : null}
      {saveMessage ? <p className="info-banner">{saveMessage}</p> : null}
      {loading ? <p className="info-banner">Loading nurse desk queue…</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Nurse desk line ({deskQueue.length})
          </p>
          {!loading && deskQueue.length === 0 ? (
            <ModuleEmptyState
              title="No nurse-desk patients in queue"
              description="Health Card, Sanitary Permit, Exhumation/Cremation/Transfer, Death Certificate Review, and Pre-marriage Counseling appear here."
            />
          ) : (
            deskQueue.map((item) => {
              const name = item.service_name || serviceNameById.get(item.service_id) || item.service_code || 'Service'
              const kind = resolveNurseDeskKind({ serviceCode: item.service_code, serviceName: name })
              const active = item.id === selectedId
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openCase(item)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    active
                      ? 'border-teal-400 bg-teal-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-teal-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold text-teal-800">{queueLabelOf(item)}</p>
                      <p className="font-semibold text-slate-900">{item.patient_name}</p>
                      <p className="text-xs text-slate-600">{nurseDeskKindLabel(kind)}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.reason || 'No reason'}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClasses(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                </button>
              )
            })
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          {!selected ? (
            <ModuleEmptyState
              title="Select a patient"
              description="Choose a waiting patient from the nurse desk line to review intake. Tap Call patient when ready — tickets stay Waiting until then."
            />
          ) : panelLoading ? (
            <p className="info-banner">Loading case…</p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Processing</p>
                  <h3 className="text-xl font-bold text-slate-900">
                    {queueLabelOf(selected)} · {selected.patient_name}
                  </h3>
                  <p className="text-sm text-slate-600">{nurseDeskKindLabel(serviceKind)}</p>
                  {serviceRequest?.reference_number ? (
                    <p className="text-xs text-slate-500">Ref: {serviceRequest.reference_number}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {['waiting', 'next', 'skipped'].includes((selected.status ?? '').toLowerCase()) ? (
                    <button type="button" className="primary-btn !mt-0 text-xs" onClick={() => void callPatient()}>
                      Call patient
                    </button>
                  ) : null}
                  {issuedDoc?.row ? (
                    <button type="button" className="secondary-btn !mt-0 text-xs" onClick={downloadIssuedPdf}>
                      Download PDF — {documentTitleFromRow(issuedDoc.row)}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="secondary-btn !mt-0 text-xs"
                    onClick={() => setShowPatientInfo(true)}
                  >
                    View patient information
                  </button>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(selected.status)}`}>
                    {statusLabel(selected.status)}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Patient intake form
                </p>
                <div className="max-h-[50vh] overflow-y-auto rounded-xl bg-white p-2">
                  {Object.keys(intakeData).length === 0 ? (
                    <p className="p-4 text-sm text-slate-600">
                      No intake answers found yet. You can still complete the service using the patient profile and notes below.
                    </p>
                  ) : (
                    <CharterServiceForm
                      serviceName={serviceDisplayName}
                      charterKey={charterKey}
                      data={intakeData}
                      readOnly
                    />
                  )}
                </div>
              </div>

              <form onSubmit={handleComplete} className="space-y-4 rounded-2xl border border-teal-200 bg-teal-50/30 p-4">
                <p className="text-sm font-semibold text-teal-900">Staff action & release</p>
                <div>
                  <label className="field-label" htmlFor="nurse-outcome">
                    Outcome / document released *
                  </label>
                  <input
                    id="nurse-outcome"
                    className="field-input"
                    value={outcome}
                    onChange={(e) => setOutcome(e.target.value)}
                    placeholder="e.g. Health card released, Sanitary permit issued"
                    required
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="nurse-notes">
                    Notes
                  </label>
                  <textarea
                    id="nurse-notes"
                    className="field-input min-h-24"
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Requirements checked, fees, release remarks…"
                  />
                </div>
                <p className="text-xs text-slate-600">
                  Saving creates a paperless record (patient info + outcome + notes) visible in the patient Medical Records.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="primary-btn" disabled={saving}>
                    {saving ? 'Saving…' : 'Complete & release'}
                  </button>
                  <button
                    type="button"
                    className="secondary-btn !mt-0"
                    onClick={() => {
                      setSelectedId(null)
                      setExistingRecord(null)
                      setShowPatientInfo(false)
                    }}
                  >
                    Close
                  </button>
                </div>
              </form>

              {showPatientInfo ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
                  <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Master patient profile
                        </p>
                        <h3 className="text-lg font-bold text-slate-900">
                          {patientProfile?.name || selected.patient_name}
                        </h3>
                      </div>
                      <button
                        type="button"
                        className="secondary-btn !mt-0 text-xs"
                        onClick={() => setShowPatientInfo(false)}
                      >
                        Close
                      </button>
                    </div>
                    <div className="p-5 sm:p-6">
                      <PatientProfileView patient={patientProfile} email={patientEmail} />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
