import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import OutpatientLegacyForm from '../../components/OutpatientLegacyForm'
import AnimalBiteLegacyForm from '../../components/AnimalBiteLegacyForm'
import TbLegacyForm from '../../components/TbLegacyForm'
import { useAuth } from '../../context/useAuth'
import { logAuditEvent, supabase } from '../../lib/supabaseClient'
import { listLocalQueue, updateQueueStatusLocal, countPendingOutbox } from '../../lib/offline/queueService'
import { startAutoSync, syncNow } from '../../lib/offline/syncEngine'
import { useOnlineStatus } from '../../lib/offline/connectivity'
import { getPatientCacheById, getPatientCacheByAuthId, upsertPatientsCache } from '../../lib/offline/patientsCacheService'
import {
  buildAnimalBiteDoseDates,
  buildTbWeeklySchedule,
} from '../../lib/workflowEngine'
import { sendSms, msgVaccineSchedule, msgFollowUpReminder } from '../../lib/smsService'
import { savePatientRecordLocal, saveScheduleLocal, enqueueServiceRequestUpdate } from '../../lib/offline/paperlessService'
import PatientProfileView from '../../components/PatientProfileView'
import useBodyScrollLock from '../../hooks/useBodyScrollLock'
import Icd10DiagnosisField from '../../components/Icd10DiagnosisField'
import {
  isDoctorBoundQueueItem,
  mergeIntakeResponses,
  queueLabelOf,
  resolveDoctorServiceKind,
} from '../../lib/doctorServices'
import { resolvePatientPriority, compareByPriorityThenArrival } from '../../lib/patientPriority'
import { linePositionLabel } from '../../lib/queueDemoExamples'
import { formatIcd10Diagnosis, parseIcd10Diagnosis, ICD10_OTHER } from '../../lib/icd10Codes'
import {
  documentTitleFromRow,
  fetchIssuedDocForServiceRequest,
  releaseIssuedDocument,
} from '../../lib/issueDocuments'
import {
  downloadIssuedDocumentPdf,
  pdfPayloadFromCertificate,
  pdfPayloadFromPermit,
} from '../../lib/issuedDocumentPdf'

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

function serviceKindLabel(kind) {
  if (kind === 'animal_bite') return 'Animal Bite'
  if (kind === 'outpatient') return 'Outpatient Consultation'
  if (kind === 'medcert') return 'Medical Certificate'
  if (kind === 'tb') return 'Tuberculosis Treatment'
  return 'Service'
}

export default function DoctorConsultPage() {
  const { user } = useAuth()
  const online = useOnlineStatus()
  const [queueItems, setQueueItems] = useState([])
  const [serviceNameById, setServiceNameById] = useState(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pendingSync, setPendingSync] = useState(0)

  const [selectedId, setSelectedId] = useState(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [formData, setFormData] = useState({})
  const [serviceRequest, setServiceRequest] = useState(null)
  const [existingRecord, setExistingRecord] = useState(null)
  const [diagnosisCode, setDiagnosisCode] = useState('')
  const [diagnosisOther, setDiagnosisOther] = useState('')
  const [notes, setNotes] = useState('')
  const [prescription, setPrescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [scheduleEnabled, setScheduleEnabled] = useState(true)
  const [scheduleStartDate, setScheduleStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [tbWeeks, setTbWeeks] = useState(24)
  const [markDose1Done, setMarkDose1Done] = useState(true)
  const [patientAuthId, setPatientAuthId] = useState(null)
  const [patientEmail, setPatientEmail] = useState(null)
  const [patientProfile, setPatientProfile] = useState(null)
  const [showPatientInfo, setShowPatientInfo] = useState(false)
  const [issuedDoc, setIssuedDoc] = useState(null)
  const [bhwEncoded, setBhwEncoded] = useState(false)

  useBodyScrollLock(showPatientInfo)

  const refreshQueue = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (online) await syncNow()
      const rows = await listLocalQueue()
      setQueueItems(rows)
      setPendingSync(await countPendingOutbox())
    } catch (e) {
      setError(e?.message || 'Failed to load doctor queue.')
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

  const doctorQueue = useMemo(() => {
    const live = queueItems
      .filter((item) => ACTIVE.has((item.status ?? '').toLowerCase()))
      .filter((item) => isDoctorBoundQueueItem(item, serviceNameById))
    return live
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
    () => doctorQueue.find((q) => q.id === selectedId) ?? null,
    [doctorQueue, selectedId],
  )

  const serviceKind = useMemo(() => {
    if (!selected) return null
    const name = selected.service_name || serviceNameById.get(selected.service_id) || ''
    return resolveDoctorServiceKind({ serviceCode: selected.service_code, serviceName: name })
  }, [selected, serviceNameById])

  const openConsult = async (item) => {
    setSelectedId(item.id)
    setPanelLoading(true)
    setSaveMessage('')
    setError('')
    setDiagnosisCode('')
    setDiagnosisOther('')
    setNotes('')
    setPrescription('')
    setFormData({ patient_name: item.patient_name })
    setServiceRequest(null)
    setExistingRecord(null)
    setPatientAuthId(null)
    setPatientEmail(null)
    setPatientProfile(null)
    setShowPatientInfo(false)
    setIssuedDoc(null)
    setBhwEncoded(false)
    const openingServiceKind = resolveDoctorServiceKind({
      serviceCode: item.service_code,
      serviceName: item.service_name || serviceNameById.get(item.service_id) || '',
    })
    setScheduleEnabled(openingServiceKind !== 'outpatient')
    setScheduleStartDate(new Date().toISOString().slice(0, 10))
    setTbWeeks(24)
    setMarkDose1Done(true)

    try {
      // Keep Waiting until doctor taps Call — do not auto-call on open
      let sr = null
      if (online) {
        if (item.patient_id) {
          const { data: patientRow } = await supabase
            .from('patients')
            .select('*')
            .eq('id', item.patient_id)
            .maybeSingle()
          if (patientRow) {
            setPatientProfile(patientRow)
            setPatientAuthId(patientRow.patient_auth_id ?? null)
            setPatientEmail(patientRow.email || null)
            void upsertPatientsCache([patientRow])
          }
        } else if (item.patient_auth_id) {
          const { data: patientRow } = await supabase
            .from('patients')
            .select('*')
            .eq('patient_auth_id', item.patient_auth_id)
            .maybeSingle()
          if (patientRow) {
            setPatientProfile(patientRow)
            setPatientAuthId(patientRow.patient_auth_id ?? item.patient_auth_id)
            setPatientEmail(patientRow.email || null)
            void upsertPatientsCache([patientRow])
          } else {
            setPatientAuthId(item.patient_auth_id)
          }
        }

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

          const intake =
            sr.intake_data && typeof sr.intake_data === 'object' && !Array.isArray(sr.intake_data)
              ? sr.intake_data
              : {}
          const staffEncode =
            intake.staff_encode && typeof intake.staff_encode === 'object' ? intake.staff_encode : {}
          const hasBhwEncode = Object.keys(staffEncode).length > 0
          setBhwEncoded(hasBhwEncode)

          const { data: responses } = await supabase
            .from('form_responses')
            .select('response_data, workflow_step_id')
            .eq('service_request_id', sr.id)
          const merged = mergeIntakeResponses(responses ?? [])

          setFormData((prev) => ({
            ...prev,
            ...staffEncode,
            ...merged,
            join_reason: intake.join_reason || staffEncode.join_reason || '',
            patient_name: item.patient_name,
          }))
          if (merged.bite_date || staffEncode.bite_date) {
            setScheduleStartDate(String(merged.bite_date || staffEncode.bite_date).slice(0, 10))
          } else if (merged.date_of_consultation || staffEncode.date_of_consultation) {
            setScheduleStartDate(
              String(merged.date_of_consultation || staffEncode.date_of_consultation).slice(0, 10),
            )
          }

          if (sr.service_id) {
            const { data: svc } = await supabase.from('services').select('name, queue_prefix').eq('id', sr.service_id).maybeSingle()
            if (svc?.name) {
              setServiceNameById((prev) => {
                const next = new Map(prev)
                next.set(sr.service_id, svc.name)
                return next
              })
            }
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
          const parsed = parseIcd10Diagnosis(record.diagnosis ?? '')
          setDiagnosisCode(parsed.code)
          setDiagnosisOther(parsed.otherText)
          setNotes(record.notes ?? '')
          setPrescription(record.prescription ?? '')
          setFormData((prev) => ({ ...record, ...prev, patient_name: item.patient_name }))
          await supabase
            .from('patient_records')
            .update({
              workflow_status: 'doctor_in_progress',
              ...(user?.id ? { assigned_doctor_id: user.id } : {}),
            })
            .eq('id', record.id)
        } else if (item.patient_id) {
          const { data: byPatientRecord } = await supabase
            .from('patient_records')
            .select('*')
            .eq('patient_id', item.patient_id)
            .in('workflow_status', ['awaiting_doctor', 'doctor_in_progress'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (byPatientRecord) {
            setExistingRecord(byPatientRecord)
            const parsed = parseIcd10Diagnosis(byPatientRecord.diagnosis ?? '')
            setDiagnosisCode(parsed.code)
            setDiagnosisOther(parsed.otherText)
            setNotes(byPatientRecord.notes ?? '')
            setPrescription(byPatientRecord.prescription ?? '')
            setFormData((prev) => ({ ...byPatientRecord, ...prev, patient_name: item.patient_name }))
            await supabase
              .from('patient_records')
              .update({
                workflow_status: 'doctor_in_progress',
                ...(user?.id ? { assigned_doctor_id: user.id } : {}),
              })
              .eq('id', byPatientRecord.id)
          }
        }

        if (sr?.id) {
          const existing = await fetchIssuedDocForServiceRequest(sr.id)
          if (existing) setIssuedDoc(existing)
        }
      } else {
        // Offline: hydrate profile from IndexedDB patient cache when possible
        if (item.patient_id) {
          const cached = await getPatientCacheById(item.patient_id)
          if (cached) {
            setPatientProfile(cached)
            setPatientAuthId(cached.patient_auth_id ?? null)
          }
        } else if (item.patient_auth_id) {
          const cached = await getPatientCacheByAuthId(item.patient_auth_id)
          if (cached) {
            setPatientProfile(cached)
            setPatientAuthId(cached.patient_auth_id ?? item.patient_auth_id)
          } else {
            setPatientAuthId(item.patient_auth_id)
          }
        }
        setFormData((prev) => ({ ...prev, patient_name: item.patient_name }))
      }
    } catch (e) {
      setError(e?.message || 'Failed to load patient forms.')
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
    const diagnosisText = formatIcd10Diagnosis(diagnosisCode, diagnosisOther).trim()
    if (!diagnosisText) {
      setError('Diagnosis is required. Select an ICD-10 code or choose Others and specify.')
      return
    }

    setSaving(true)
    setError('')
    setSaveMessage('')
    const nowIso = new Date().toISOString()

    try {
      // Ensure patient_auth_id is linked so the patient portal can see the record
      let resolvedAuthId = patientAuthId ?? serviceRequest?.patient_auth_id ?? patientProfile?.patient_auth_id ?? null
      let resolvedPatientId = selected.patient_id ?? serviceRequest?.patient_id ?? patientProfile?.id ?? null
      if (online && !resolvedAuthId && resolvedPatientId) {
        const { data: linked } = await supabase
          .from('patients')
          .select('id, patient_auth_id, email')
          .eq('id', resolvedPatientId)
          .maybeSingle()
        if (linked?.patient_auth_id) {
          resolvedAuthId = linked.patient_auth_id
          setPatientAuthId(linked.patient_auth_id)
        }
        if (linked?.email && !patientEmail) setPatientEmail(linked.email)
      }

      const recordPayload = {
        patient_name: selected.patient_name,
        diagnosis: diagnosisText,
        notes: notes.trim() || null,
        prescription: prescription.trim() || null,
        queue_id: selected.id,
        patient_id: resolvedPatientId,
        patient_auth_id: resolvedAuthId,
        workflow_status: 'completed',
        doctor_completed_at: nowIso,
        ...(user?.id ? { assigned_doctor_id: user.id } : {}),
        date_of_consultation: nowIso.slice(0, 10),
      }

      // Paperless record: master profile + intake fields, then diagnosis/notes
      const carry = [
        'first_name',
        'middle_name',
        'last_name',
        'birthdate',
        'sex',
        'age',
        'civil_status',
        'blood_type',
        'religion',
        'mother_maiden_name',
        'mobile_phone',
        'philhealth_number',
        'education',
        'occupation',
        'disability',
        'house_no_purok',
        'barangay',
        'municipality',
        'province',
        'address',
        'bp',
        'temp',
        'spo2',
        'wt',
        'ht',
        'pr_hr',
        'rr',
      ]
      const profileSource = { ...(patientProfile || {}), ...formData }
      for (const key of carry) {
        if (profileSource[key] != null && profileSource[key] !== '') recordPayload[key] = profileSource[key]
      }
      if (!recordPayload.mobile_phone && (patientProfile?.phone || formData.phone)) {
        recordPayload.mobile_phone = patientProfile?.phone || formData.phone
      }
      if (!recordPayload.age && patientProfile?.birthdate) {
        const parsed = new Date(patientProfile.birthdate)
        if (!Number.isNaN(parsed.getTime())) {
          const today = new Date()
          let age = today.getFullYear() - parsed.getFullYear()
          const monthDiff = today.getMonth() - parsed.getMonth()
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsed.getDate())) age -= 1
          if (age >= 0) recordPayload.age = age
        }
      }

      // Carry medcert purpose flags onto the paperless record
      for (const key of [
        'medcert_pwd',
        'medcert_work',
        'medcert_financial',
        'medcert_4ps',
        'medcert_school',
        'medcert_others',
      ]) {
        if (formData[key] != null && formData[key] !== '') recordPayload[key] = formData[key]
      }

      let recordId = existingRecord?.id ?? crypto.randomUUID()
      const { offline: recordOffline } = await savePatientRecordLocal({
        ...recordPayload,
        id: recordId,
      })

      await updateQueueStatusLocal(selected, 'completed')

      if (serviceRequest?.id) {
        const statusPatch = { status: 'Completed', updated_at: nowIso }
        if (online) {
          await supabase
            .from('service_requests')
            .update(statusPatch)
            .eq('id', serviceRequest.id)
        } else {
          await enqueueServiceRequestUpdate(serviceRequest.id, statusPatch)
        }
      }

      let released = null
      if (online && serviceKind === 'medcert' && resolvedPatientId) {
        const name =
          selected.service_name || serviceNameById.get(selected.service_id) || 'Medical Certificate'
        released = await releaseIssuedDocument({
          serviceKind: 'medcert',
          serviceName: name,
          patientId: resolvedPatientId,
          serviceRequestId: serviceRequest?.id ?? null,
          issuedBy: user?.id ?? null,
          outcome: diagnosisText,
          notes: notes.trim() || null,
          formData,
          applicantName: selected.patient_name,
        })
        if (released?.ok && released.row) {
          setIssuedDoc({ kind: 'certificate', row: released.row })
        }
      }

      // Create follow-up schedules (local-first).
      if (scheduleEnabled && (serviceKind === 'animal_bite' || serviceKind === 'tb' || serviceKind === 'outpatient')) {
        const patientId = selected.patient_id ?? serviceRequest?.patient_id ?? null
        const authId = patientAuthId ?? serviceRequest?.patient_auth_id ?? null
        const email = patientEmail || formData.email || null
        const phone = selected.phone_number || formData.mobile_phone_number || formData.phone || null

        if (serviceKind === 'animal_bite') {
          const dates = buildAnimalBiteDoseDates(scheduleStartDate)
          const scheduleRow = {
            id: crypto.randomUUID(),
            ...dates,
            patient_id: patientId,
            patient_auth_id: authId,
            service_request_id: serviceRequest?.id ?? null,
            phone_number: phone,
            patient_email: email,
            dose_1_done: Boolean(markDose1Done),
            dose_1_given_at: markDose1Done ? nowIso : null,
            next_due_dose: markDose1Done ? 2 : 1,
            next_due_date: markDose1Done ? dates.dose_2_date : dates.dose_1_date,
            status: 'active',
            notes: notes.trim() || null,
          }
          await saveScheduleLocal({ kind: 'animal_bite', row: scheduleRow })

          if (online && email && scheduleRow.next_due_date) {
            try {
              await sendSms({
                to: email,
                message: msgVaccineSchedule({
                  patientName: selected.patient_name,
                  doseNumber: scheduleRow.next_due_dose ?? 2,
                  date: scheduleRow.next_due_date,
                }),
              })
            } catch {
              /* email is best-effort */
            }
          }
        }

        if (serviceKind === 'tb') {
          const schedule = buildTbWeeklySchedule(scheduleStartDate, tbWeeks)
          const scheduleRow = {
            id: crypto.randomUUID(),
            patient_id: patientId,
            patient_auth_id: authId,
            service_request_id: serviceRequest?.id ?? null,
            phone_number: phone,
            patient_email: email,
            start_date: scheduleStartDate,
            schedule,
            treatment_duration_weeks: tbWeeks,
            last_visit_date: scheduleStartDate,
            status: 'active',
            notes: notes.trim() || null,
          }
          await saveScheduleLocal({ kind: 'tb', row: scheduleRow })

          if (online && email) {
            try {
              const nextSlot = schedule.find((s) => s.status === 'pending')
              if (nextSlot?.date) {
                await sendSms({
                  to: email,
                  message: msgFollowUpReminder({
                    type: 'TB Treatment',
                    date: nextSlot.date,
                    dose: `Week ${nextSlot.week}`,
                  }),
                })
              }
            } catch {
              /* email is best-effort */
            }
          }
        }

        if (serviceKind === 'outpatient') {
          await saveScheduleLocal({
            kind: 'outpatient',
            row: {
              id: crypto.randomUUID(),
              patient_id: patientId,
              patient_auth_id: authId,
              patient_name: selected.patient_name || patientProfile?.name || 'Patient',
              appointment_date: scheduleStartDate,
              status: 'scheduled',
              reason: 'Outpatient Follow-up',
              preferred_schedule: 'Set by doctor during consultation',
              notes: notes.trim() || null,
            },
          })
        }
      }

      if (online) await syncNow()

      void logAuditEvent({
        action: 'doctor_complete_queue_consult',
        entityType: 'patient_records',
        entityId: recordId,
        metadata: {
          queue_id: selected.id,
          service_code: selected.service_code ?? null,
          follow_up_scheduled: Boolean(scheduleEnabled && (serviceKind === 'animal_bite' || serviceKind === 'tb' || serviceKind === 'outpatient')),
          issued_document: released?.ok
            ? { table: released.table, id: released.row?.id, title: released.title }
            : null,
          offline: recordOffline,
        },
      })

      setSaveMessage(
        recordOffline
          ? 'Saved offline. Diagnosis/forms/schedules will sync when you reconnect.'
          : released?.ok
            ? 'Medical Certificate released. Patient can download it from Medical Records.'
            : scheduleEnabled && (serviceKind === 'animal_bite' || serviceKind === 'tb' || serviceKind === 'outpatient')
              ? 'Consultation saved and follow-up schedule created. Patient can view it in their portal.'
              : 'Consultation saved. Patient removed from active doctor queue.',
      )
      setSelectedId(null)
      setExistingRecord(null)
      setServiceRequest(null)
      setIssuedDoc(null)
      setDiagnosisCode('')
      setDiagnosisOther('')
      setNotes('')
      setPrescription('')
      await refreshQueue()
    } catch (e) {
      setError(e?.message || 'Failed to save consultation.')
    } finally {
      setSaving(false)
    }
  }

  const downloadIssuedPdf = () => {
    if (!issuedDoc?.row) return
    const name = selected?.patient_name || patientProfile?.name || 'Patient'
    const payload =
      issuedDoc.kind === 'permit'
        ? pdfPayloadFromPermit(issuedDoc.row, name)
        : pdfPayloadFromCertificate(issuedDoc.row, name)
    downloadIssuedDocumentPdf({
      ...payload,
      patientDetails: {
        age: patientProfile?.age ?? formData.age,
        sex: patientProfile?.sex ?? formData.sex,
        birthdate: patientProfile?.birthdate ?? formData.birthdate,
        barangay: patientProfile?.barangay ?? formData.barangay,
        house_no_purok: patientProfile?.house_no_purok ?? formData.house_no_purok,
        municipality: patientProfile?.municipality ?? formData.municipality ?? 'Pila',
        province: patientProfile?.province ?? formData.province ?? 'Laguna',
      },
    })
  }

  const renderPatientForm = () => {
    if (serviceKind === 'animal_bite') {
      return <AnimalBiteLegacyForm data={formData} readOnly />
    }
    if (serviceKind === 'tb') {
      return <TbLegacyForm data={formData} readOnly />
    }
    // OPD + Medical Certificate share OutpatientLegacyForm (includes medcert checkboxes)
    return <OutpatientLegacyForm data={formData} readOnly />
  }

  return (
    <section className="module-card space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="module-title">Doctor Consult</h2>
          <p className="module-subtitle">
            Patients for Animal Bite, Outpatient, Medical Certificate, and TB. View patient information, then add diagnosis and notes — paperless record goes to the patient account.
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
      {loading ? <p className="info-banner">Loading doctor queue…</p> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Doctor line — top is Next ({doctorQueue.length})
          </p>
          {!loading && doctorQueue.length === 0 ? (
            <ModuleEmptyState
              title="No doctor-bound patients in queue"
              description="Only Animal Bite, Outpatient Consultation, Medical Certificate, and TB appear here when they are waiting, next, or called."
            />
          ) : (
            doctorQueue.map((item, index) => {
              const name = item.service_name || serviceNameById.get(item.service_id) || item.service_code || 'Service'
              const kind = resolveDoctorServiceKind({ serviceCode: item.service_code, serviceName: name })
              const active = item.id === selectedId
              const priority = resolvePatientPriority(item)
              const position = linePositionLabel(index)
              const isNext = index === 0
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openConsult(item)}
                  className={`flex w-full items-stretch gap-3 rounded-2xl border p-3 text-left transition sm:p-4 ${
                    active
                      ? 'border-teal-400 bg-teal-50 shadow-sm'
                      : isNext
                          ? 'border-teal-400 bg-teal-50/40 ring-2 ring-teal-200'
                          : priority.isPriority
                            ? 'border-violet-300 bg-violet-50/40 hover:border-violet-400'
                            : 'border-slate-200 bg-white hover:border-teal-200 hover:bg-slate-50'
                  }`}
                >
                  <div
                    className={`flex w-16 shrink-0 flex-col items-center justify-center rounded-xl px-1 py-2 text-center ${
                      isNext ? 'bg-teal-700 text-white' : priority.isPriority ? 'bg-violet-100 text-violet-900' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <span className="text-xs font-extrabold leading-tight">{position}</span>
                  </div>
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold text-teal-800">{queueLabelOf(item)}</p>
                      <p className="font-semibold text-slate-900">{item.patient_name}</p>
                      <p className="text-xs text-slate-600">{serviceKindLabel(kind)}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.reason || 'No reason'}</p>
                      {priority.isPriority ? (
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-violet-800">
                          Priority · {priority.label}
                        </p>
                      ) : (
                        <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Regular</p>
                      )}
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
              description="Choose a waiting patient from the doctor line to review their form. Tap Call patient when ready — tickets stay Waiting until then."
            />
          ) : panelLoading ? (
            <p className="info-banner">Loading patient forms…</p>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Consulting</p>
                  <h3 className="text-xl font-bold text-slate-900">
                    {queueLabelOf(selected)} · {selected.patient_name}
                  </h3>
                  <p className="text-sm text-slate-600">{serviceKindLabel(serviceKind)}</p>
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
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses(selected.status)}`}>
                    {statusLabel(selected.status)}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-sm font-semibold text-slate-800">Patient information</p>
                <p className="mt-1 text-sm text-slate-600">
                  {bhwEncoded
                    ? 'BHW / Volunteer encoding is ready. Open it only when you need demographics or visit details.'
                    : 'Open the patient profile when you need demographics or visit details.'}
                </p>
                <button
                  type="button"
                  className="secondary-btn mt-3 !mt-3 text-xs"
                  onClick={() => setShowPatientInfo(true)}
                >
                  View patient information
                </button>
              </div>

              <form onSubmit={handleComplete} className="space-y-4 rounded-2xl border border-teal-200 bg-teal-50/30 p-4">
                <p className="text-sm font-semibold text-teal-900">Doctor diagnosis & notes</p>
                <Icd10DiagnosisField
                  code={diagnosisCode}
                  otherText={diagnosisOther}
                  onCodeChange={(value) => {
                    setDiagnosisCode(value)
                    if (value !== ICD10_OTHER) setDiagnosisOther('')
                  }}
                  onOtherTextChange={setDiagnosisOther}
                />
                <div>
                  <label className="field-label" htmlFor="doc-notes">
                    Notes
                  </label>
                  <textarea
                    id="doc-notes"
                    className="field-input min-h-24"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Clinical notes, advice, follow-up"
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="doc-prescription">
                    Prescription
                  </label>
                  <textarea
                    id="doc-prescription"
                    className="field-input min-h-24"
                    value={prescription}
                    onChange={(e) => setPrescription(e.target.value)}
                    placeholder="Medications, dose, frequency, duration (free text)"
                  />
                </div>

                {serviceKind === 'animal_bite' || serviceKind === 'tb' || serviceKind === 'outpatient' ? (
                  <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                    <label className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                      <input
                        type="checkbox"
                        checked={scheduleEnabled}
                        onChange={(e) => setScheduleEnabled(e.target.checked)}
                      />
                      {serviceKind === 'outpatient' ? 'Set next outpatient check-up' : 'Set follow-up monitoring schedule'}
                    </label>
                    {scheduleEnabled ? (
                      <>
                        <div>
                          <label className="field-label" htmlFor="schedule-start">
                            {serviceKind === 'animal_bite'
                              ? 'Bite / Day 0 date'
                              : serviceKind === 'tb'
                                ? 'Treatment start date'
                                : 'Next check-up date'}
                          </label>
                          <input
                            id="schedule-start"
                            type="date"
                            className="field-input"
                            value={scheduleStartDate}
                            onChange={(e) => setScheduleStartDate(e.target.value)}
                            min={serviceKind === 'outpatient' ? new Date().toISOString().slice(0, 10) : undefined}
                            required
                          />
                        </div>
                        {serviceKind === 'animal_bite' ? (
                          <>
                            <label className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                checked={markDose1Done}
                                onChange={(e) => setMarkDose1Done(e.target.checked)}
                              />
                              Dose 1 given today (Day 0)
                            </label>
                            <div className="rounded-lg border border-amber-100 bg-white p-3 text-xs text-slate-600">
                              <p className="mb-1 font-semibold text-slate-800">Anti-rabies doses</p>
                              {(() => {
                                const d = buildAnimalBiteDoseDates(scheduleStartDate)
                                return (
                                  <ul className="grid gap-1 sm:grid-cols-2">
                                    <li>Dose 1 (Day 0): {d.dose_1_date}</li>
                                    <li>Dose 2 (Day 3): {d.dose_2_date}</li>
                                    <li>Dose 3 (Day 7): {d.dose_3_date}</li>
                                    <li>Dose 4 (Day 14): {d.dose_4_date}</li>
                                    <li>Dose 5 (Day 28): {d.dose_5_date}</li>
                                  </ul>
                                )
                              })()}
                            </div>
                          </>
                        ) : serviceKind === 'tb' ? (
                          <>
                            <div>
                              <label className="field-label" htmlFor="tb-weeks">
                                Treatment duration (weeks)
                              </label>
                              <input
                                id="tb-weeks"
                                type="number"
                                min={1}
                                max={52}
                                className="field-input"
                                value={tbWeeks}
                                onChange={(e) => setTbWeeks(Number(e.target.value) || 24)}
                              />
                            </div>
                            <div className="rounded-lg border border-amber-100 bg-white p-3 text-xs text-slate-600">
                              <p className="mb-1 font-semibold text-slate-800">
                                Weekly visits: {tbWeeks} weeks from {scheduleStartDate}
                              </p>
                              <p>
                                Next pending visit:{' '}
                                {buildTbWeeklySchedule(scheduleStartDate, tbWeeks).find((s) => s.status === 'pending')
                                  ?.date || '—'}
                              </p>
                            </div>
                          </>
                        ) : (
                          <div className="rounded-lg border border-amber-100 bg-white p-3 text-xs text-slate-600">
                            <p className="font-semibold text-slate-800">Doctor-set outpatient check-up</p>
                            <p className="mt-1">The patient and Follow-ups desk will see the selected date: {scheduleStartDate || '—'}.</p>
                          </div>
                        )}
                        <p className="text-xs text-amber-800">
                          Patient will see this schedule under Follow-up Schedules in their portal. Staff can track it in Follow-ups.
                        </p>
                      </>
                    ) : null}
                  </div>
                ) : null}

                <p className="text-xs text-slate-600">
                  Saving creates a paperless medical record (patient info + diagnosis + notes). The patient can view it under Medical Records in their account — no file attachment needed.
                </p>

                <div className="flex flex-wrap gap-2">
                  <button type="submit" className="primary-btn" disabled={saving}>
                    {saving ? 'Saving…' : 'Save diagnosis & complete'}
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
                <div className="modal-overlay z-50 flex items-start justify-center overflow-hidden bg-slate-900/50 p-4 sm:items-center" role="dialog" aria-modal="true">
                  <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
                    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Patient information
                        </p>
                        <h3 className="text-lg font-bold text-slate-900">
                          {patientProfile?.name || selected.patient_name}
                        </h3>
                        <p className="mt-1 text-xs text-slate-500">
                          {bhwEncoded
                            ? 'Includes master profile and BHW / Volunteer encoding for this visit.'
                            : 'Master patient profile on file.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="secondary-btn !mt-0 text-xs"
                        onClick={() => setShowPatientInfo(false)}
                      >
                        Close
                      </button>
                    </div>
                    <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
                      <div>
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Master patient profile
                        </p>
                        <PatientProfileView patient={patientProfile} email={patientEmail} />
                      </div>
                      <div>
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {bhwEncoded ? 'BHW / Volunteer encoded details' : 'Visit / intake form'}
                        </p>
                        {Object.keys(formData).length <= 1 ? (
                          <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                            No encoded visit form is linked to this queue ticket yet.
                          </p>
                        ) : (
                          <div className="rounded-xl border border-slate-200 bg-white p-3">{renderPatientForm()}</div>
                        )}
                      </div>
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
