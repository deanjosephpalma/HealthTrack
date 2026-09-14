import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EncodeServiceFormModal from '../../components/EncodeServiceFormModal'
import { subscribeWorkflowChanges } from '../../lib/workflowRealtime'
import OfficialServiceEncodeForm, { isOfficialEncodeService } from '../../components/OfficialServiceEncodeForm'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import { useAuth } from '../../context/useAuth'
import { resolveDoctorServiceKind } from '../../lib/doctorServices'
import { resolveCharterKeyFromServiceName } from '../../lib/resolveCharterService'
import { createWalkIn } from '../../lib/offline/queueService'
import { syncNow } from '../../lib/offline/syncEngine'
import { useOnlineStatus } from '../../lib/offline/connectivity'
import { logAuditEvent, supabase } from '../../lib/supabaseClient'
import { resolvePatientPriority, compareByPriorityThenArrival } from '../../lib/patientPriority'
import { linePositionLabel } from '../../lib/queueDemoExamples'
import { notifyPatient } from '../../lib/patientNotifications'
import { getCharterByCode } from '../../config/citizenCharter'

const AWAITING_STATUSES = ['Awaiting Encoding', 'Encoded']
/** Highlight patients waiting longer than this (minutes) before encoding finishes. */
const STUCK_WAIT_MINUTES = 30
const ENCODE_DRAFT_STORAGE_PREFIX = 'healthtrack:staff-encode-draft:v1'

function encodeDraftStorageKey({ userId, requestId }) {
  return `${ENCODE_DRAFT_STORAGE_PREFIX}:${encodeURIComponent(userId || 'staff')}:${requestId}`
}

function loadEncodeDraft({ userId, requestId }) {
  if (!requestId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(encodeDraftStorageKey({ userId, requestId }))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function saveEncodeDraft({ userId, requestId, data }) {
  if (!requestId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(encodeDraftStorageKey({ userId, requestId }), JSON.stringify(data))
  } catch {
    // Draft persistence is best-effort; encoding remains usable if storage is unavailable.
  }
}

function clearEncodeDraft({ userId, requestId }) {
  if (!requestId || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(encodeDraftStorageKey({ userId, requestId }))
  } catch {
    // Ignore storage cleanup errors.
  }
}

/** Intake keys that must stay on service_requests.intake_data root for PDF / nurse release. */
const INTAKE_ROOT_KEYS = [
  'partner_name', 'partner_age', 'wedding_date', 'wedding_place',
  'has_marriage_license_application', 'contact_number', 'partner_contact', 'address', 'additional_notes',
  'join_reason',
  'is_senior',
  'is_pwd',
  'is_priority',
  'priority_labels',
  'handler_type',
  'applicant_name',
  'applicant_age',
  'applicant_sex',
  'nationality',
  'establishment_name',
  'establishment_address',
  'establishment_type',
  'nature_of_business',
  'position_or_work',
  'applicant_contact',
  'registration_number',
  'has_lab_request',
  'has_lab_result',
  'has_medical_certificate',
  'owner_name',
  'owner_contact',
  'number_of_employees',
  'application_type',
  'permit_number',
  'date_of_issuance',
  'date_of_expiration',
  'has_health_certificate',
  'has_business_permit_application',
  'permit_type',
  'deceased_name',
  'deceased_sex',
  'deceased_age',
  'date_of_death',
  'date_of_birth',
  'place_of_death',
  'cause_of_death',
  'cemetery_or_destination',
  'requester_name',
  'requester_relationship',
  'requester_contact',
  'requester_address',
  'or_number',
  'or_date',
  'documents_ready',
  'deceased_civil_status',
  'deceased_religion',
  'deceased_citizenship',
  'deceased_residence',
  'deceased_occupation',
  'father_name',
  'mother_maiden_name_deceased',
  'corpse_disposal',
  'burial_cremation_permit_no',
  'transfer_permit_no',
  'review_reason',
  'purpose',
  'has_death_certificate',
  'registry_number',
  'additional_notes',
]

function pickIntakeRootFields(source = {}) {
  const out = {}
  for (const key of INTAKE_ROOT_KEYS) {
    if (source[key] !== undefined) out[key] = source[key]
  }
  return out
}

const REQUIRED_ENCODE_FIELDS = {
  pre_marriage_counseling: getCharterByCode('pre_marriage_counseling').intakeFields
    .filter((field) => field.required).map((field) => [field.name, field.label]),
  outpatient: [
    ['first_name', 'First name'],
    ['last_name', 'Last name'],
    ['birthdate', 'Birthdate'],
    ['age', 'Age'],
    ['sex', 'Sex'],
    ['date_of_consultation', 'Date of consultation'],
    ['wt', 'Weight (kg)'],
    ['temp', 'Temperature (°C)'],
    ['bp', 'Blood pressure'],
    ['pr_hr', 'HR / PR'],
    ['rr', 'Respiratory rate'],
    ['ht', 'Height (cm)'],
    ['spo2', 'SPO2 (%)'],
    ['waist', 'Waist (cm)'],
    ['hip', 'Hip (cm)'],
    ['barangay', 'Barangay'],
  ],
  animal_bite: [
    ['first_name', 'First name'],
    ['last_name', 'Last name'],
    ['barangay', 'Barangay'],
    ['age', 'Age'],
    ['sex', 'Sex'],
    ['date_of_consultation', 'Date of consultation'],
    ['bite_place', 'Bite place'],
    ['animal_type', 'Animal type'],
    ['bite_type', 'Bite type'],
    ['bite_site', 'Bite site'],
  ],
  tb: [
    ['diagnosing_facility', 'Diagnosing facility'],
    ['first_name', 'First name'],
    ['last_name', 'Last name'],
    ['birthdate', 'Birthdate'],
    ['age', 'Age'],
    ['sex', 'Sex'],
    ['permanent_address', 'Permanent address'],
    ['barangay', 'Barangay'],
    ['tb_case_number', 'TB case number'],
    ['tb_bacteriological_status', 'TB bacteriological status'],
    ['tb_anatomical_site', 'TB anatomical site'],
    ['tb_drug_resistance', 'TB drug resistance'],
    ['tb_registration_group', 'TB registration group'],
  ],
  health_card_issuance: [
    ['handler_type', 'Handler type'],
    ['applicant_name', 'Applicant name'],
    ['position_or_work', 'Occupation / work'],
    ['applicant_age', 'Applicant age'],
    ['applicant_sex', 'Applicant sex'],
    ['establishment_name', 'Establishment name'],
    ['establishment_address', 'Establishment address'],
    ['applicant_contact', 'Applicant contact'],
  ],
  sanitary_permit_issuance: [
    ['establishment_name', 'Establishment name'],
    ['establishment_type', 'Establishment type'],
    ['establishment_address', 'Establishment address'],
    ['owner_name', 'Owner name'],
    ['owner_contact', 'Owner contact'],
    ['application_type', 'Application type'],
  ],
  exhumation_cremation_transfer_permit: [
    ['permit_type', 'Permit type'],
    ['deceased_name', 'Deceased name'],
    ['date_of_death', 'Date of death'],
    ['place_of_death', 'Place of death'],
    ['cause_of_death', 'Cause of death'],
    ['cemetery_or_destination', 'Cemetery / destination'],
    ['requester_name', 'Requester name'],
    ['requester_relationship', 'Requester relationship'],
    ['requester_contact', 'Requester contact'],
    ['requester_address', 'Requester address'],
    ['documents_ready', 'Death certificate status'],
  ],
  review_death_certificate: [
    ['deceased_name', 'Deceased name'],
    ['date_of_death', 'Date of death'],
    ['place_of_death', 'Place of death'],
    ['cause_of_death', 'Cause of death'],
    ['requester_name', 'Requester name'],
    ['requester_relationship', 'Requester relationship'],
    ['requester_contact', 'Requester contact'],
    ['review_reason', 'Reason for review'],
    ['purpose', 'Review purpose'],
    ['has_death_certificate', 'Death certificate status'],
  ],
}

function findMissingEncodeField(snapshot, key) {
  const fields = REQUIRED_ENCODE_FIELDS[key] || REQUIRED_ENCODE_FIELDS.outpatient
  const missing = fields.find(([name]) => {
    const value = snapshot?.[name]
    return value === undefined || value === null || String(value).trim() === ''
  })
  if (missing) return missing

  if (key === 'tb' && snapshot?.tb_anatomical_site === 'Extra-pulmonary') {
    const value = snapshot?.tb_extra_pulmonary_site
    if (value === undefined || value === null || String(value).trim() === '') {
      return ['tb_extra_pulmonary_site', 'Extra-pulmonary site']
    }
  }

  return null
}

function formatWaitAge(iso) {
  if (!iso) return { label: '', minutes: 0, stuck: false }
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return { label: '', minutes: 0, stuck: false }
  const minutes = Math.max(0, Math.floor((Date.now() - then) / 60000))
  const stuck = minutes >= STUCK_WAIT_MINUTES
  let label
  if (minutes < 1) label = 'just now'
  else if (minutes < 60) label = `${minutes}m waiting`
  else {
    const hours = Math.floor(minutes / 60)
    const rem = minutes % 60
    label = rem ? `${hours}h ${rem}m waiting` : `${hours}h waiting`
  }
  return { label, minutes, stuck }
}

function formatEncodedAt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ageFromBirthdate(birthdate) {
  if (!birthdate) return ''
  const birth = new Date(birthdate)
  if (Number.isNaN(birth.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1
  return age >= 0 ? String(age) : ''
}

function displayNameFromPatient(p = {}) {
  const composed = [p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ').trim()
  return composed || p.name || 'Patient'
}

function emptyFormFromPatient(patient = {}) {
  return {
    first_name: patient.first_name || '',
    middle_name: patient.middle_name || '',
    last_name: patient.last_name || '',
    birthdate: patient.birthdate || '',
    sex: patient.sex || '',
    civil_status: patient.civil_status || '',
    blood_type: patient.blood_type || '',
    religion: patient.religion || '',
    mother_maiden_name: patient.mother_maiden_name || '',
    mobile_phone: patient.mobile_phone || patient.phone || '',
    philhealth_number: patient.philhealth_number || '',
    education: patient.education || '',
    occupation: patient.occupation || '',
    disability: patient.disability || '',
    house_no_purok: patient.house_no_purok || '',
    barangay: patient.barangay || '',
    municipality: patient.municipality || 'Pila',
    province: patient.province || 'Laguna',
    age: ageFromBirthdate(patient.birthdate),
  }
}

function buildFormFromRow(row) {
  const patient = row?.patients || {}
  const intake =
    row?.intake_data && typeof row.intake_data === 'object' && !Array.isArray(row.intake_data)
      ? row.intake_data
      : {}
  const encoded = intake.staff_encode && typeof intake.staff_encode === 'object' ? intake.staff_encode : {}
  const fromPatientIntake = pickIntakeRootFields(intake)

  // Prefill health card applicant fields from patient profile when patient left them blank.
  const composedName = displayNameFromPatient(patient)
  if (!fromPatientIntake.applicant_name && composedName && composedName !== 'Patient') {
    fromPatientIntake.applicant_name = composedName
  }
  if (!fromPatientIntake.applicant_sex && patient.sex) fromPatientIntake.applicant_sex = patient.sex
  if (!fromPatientIntake.applicant_age && patient.birthdate) {
    fromPatientIntake.applicant_age = ageFromBirthdate(patient.birthdate)
  }
  if (!fromPatientIntake.position_or_work && patient.occupation) {
    fromPatientIntake.position_or_work = patient.occupation
  }
  if (!fromPatientIntake.applicant_contact && (patient.mobile_phone || patient.phone)) {
    fromPatientIntake.applicant_contact = patient.mobile_phone || patient.phone
  }
  if (!fromPatientIntake.nationality) fromPatientIntake.nationality = 'Filipino'

  return {
    ...emptyFormFromPatient(patient),
    ...fromPatientIntake,
    ...encoded,
    join_reason: intake.join_reason || encoded.join_reason || '',
  }
}

export default function StaffEncodeDeskPage() {
  const { user, profile } = useAuth()
  const online = useOnlineStatus()
  const [rows, setRows] = useState([])
  const [walkInOpen, setWalkInOpen] = useState(false)
  const [walkInServices, setWalkInServices] = useState([])
  const [walkInDraft, setWalkInDraft] = useState(null)
  const [encoderNames, setEncoderNames] = useState(() => ({}))
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [invalidField, setInvalidField] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [nowTick, setNowTick] = useState(() => Date.now())
  const hydratedForId = useRef('')
  const formDataRef = useRef(formData)
  formDataRef.current = formData

  const selected = useMemo(() => walkInDraft || rows.find((r) => r.id === selectedId) || null, [walkInDraft, rows, selectedId])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matches = (row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!q) return true
      const p = row.patients || {}
      const name = displayNameFromPatient(p).toLowerCase()
      const hay = [
        name,
        p.barangay,
        p.municipality,
        row.reference_number,
        row.service_types?.name,
        row.service_types?.queue_prefix,
        row.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    }

    const sortEncode = (a, b) => {
      const pa = resolvePatientPriority({
        birthdate: a.patients?.birthdate,
        disability: a.patients?.disability || a.intake_data?.staff_encode?.disability,
        is_senior: a.intake_data?.is_senior,
        is_pwd: a.intake_data?.is_pwd,
        is_priority: a.intake_data?.is_priority,
        priority_labels: a.intake_data?.priority_labels,
      })
      const pb = resolvePatientPriority({
        birthdate: b.patients?.birthdate,
        disability: b.patients?.disability || b.intake_data?.staff_encode?.disability,
        is_senior: b.intake_data?.is_senior,
        is_pwd: b.intake_data?.is_pwd,
        is_priority: b.intake_data?.is_priority,
        priority_labels: b.intake_data?.priority_labels,
      })
      return compareByPriorityThenArrival(
        {
          isPriority: pa.isPriority,
          is_priority: pa.isPriority,
          line_joined_at: a.intake_data?.line_joined_at,
          created_at: a.created_at,
          intake_data: a.intake_data,
        },
        {
          isPriority: pb.isPriority,
          is_priority: pb.isPriority,
          line_joined_at: b.intake_data?.line_joined_at,
          created_at: b.created_at,
          intake_data: b.intake_data,
        },
      )
    }

    const live = rows.filter((row) => matches(row)).slice().sort(sortEncode)
    return live
  }, [rows, search, statusFilter])

  const stuckCount = useMemo(() => {
    void nowTick
    return rows.filter((row) => {
      if (row.status !== 'Awaiting Encoding') return false
      return formatWaitAge(row.created_at).stuck
    }).length
  }, [rows, nowTick])

  const serviceName = selected?.service_types?.name || ''
  const serviceCode = selected?.service_types?.queue_prefix || 'RHU'
  const serviceKind = resolveDoctorServiceKind({ serviceCode, serviceName })
  const charterKey = useMemo(() => resolveCharterKeyFromServiceName(serviceName), [serviceName])
  const useOfficialForm = isOfficialEncodeService(charterKey)

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true)
      setError('')
    }
    try {
      const { data, error: queryError } = await supabase
        .from('service_requests')
        .select(
          `
          id,
          status,
          created_at,
          updated_at,
          intake_data,
          patient_id,
          patient_auth_id,
          service_type_id,
          reference_number,
          patients (
            id,
            name,
            first_name,
            middle_name,
            last_name,
            birthdate,
            sex,
            civil_status,
            blood_type,
            religion,
            mother_maiden_name,
            mobile_phone,
            phone,
            philhealth_number,
            education,
            occupation,
            disability,
            house_no_purok,
            barangay,
            municipality,
            province
          ),
          service_types ( id, name, queue_prefix )
        `,
        )
        .in('status', AWAITING_STATUSES)
        .order('created_at', { ascending: true })
      // No hard cap — show every patient awaiting / ready for encoding.

      if (queryError) throw queryError
      const nextRows = Array.isArray(data) ? data : []
      setRows(nextRows)

      const encoderIds = [
        ...new Set(
          nextRows
            .map((r) => r?.intake_data?.encoded_by)
            .filter((id) => typeof id === 'string' && id.length > 0),
        ),
      ]
      if (encoderIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, name')
          .in('id', encoderIds)
        if (!profilesError && Array.isArray(profiles)) {
          setEncoderNames((prev) => {
            const next = { ...prev }
            for (const p of profiles) {
              if (p?.id) next[p.id] = (p.name || '').trim() || 'Staff'
            }
            return next
          })
        }
      }
    } catch (e) {
      if (!silent) {
        setError(e?.message || 'Failed to load encode line.')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  // Keep wait-age labels fresh while the list is visible.
  useEffect(() => {
    if (selectedId) return undefined
    const id = window.setInterval(() => setNowTick(Date.now()), 60000)
    return () => window.clearInterval(id)
  }, [selectedId])

  // Form hydration is separate, so live list updates preserve in-progress typing.
  useEffect(() => {
    void refresh({ silent: false })
    return subscribeWorkflowChanges(supabase, () => refresh({ silent: true }))
  }, [refresh])

  // A cancelled/removed request disappears from the active query, even while its form is open.
  useEffect(() => {
    if (!selectedId || selected) return
    clearEncodeDraft({ userId: user?.id, requestId: selectedId })
    hydratedForId.current = ''
    formDataRef.current = {}
    setSelectedId('')
    setFormData({})
    setInvalidField(null)
    setError('')
    if (!issuing) setMessage('This request is no longer in the encode line. The form has been closed.')
  }, [selectedId, selected, user?.id, issuing])

  // Hydrate form once per selected patient — never on background row refresh.
  useEffect(() => {
    if (walkInDraft) return
    if (!selectedId) {
      hydratedForId.current = ''
      setFormData({})
      return
    }
    if (hydratedForId.current === selectedId) return
    const row = rows.find((r) => r.id === selectedId)
    if (!row) return
    hydratedForId.current = selectedId
    const restoredDraft = loadEncodeDraft({ userId: user?.id, requestId: row.id })
    setFormData({ ...buildFormFromRow(row), ...(restoredDraft || {}) })
  }, [selectedId, rows, user?.id, walkInDraft])

  const displayName = (row) => displayNameFromPatient(row.patients || {})

  const handleDraftFormChange = (nextData) => {
    setFormData(nextData)
    formDataRef.current = nextData
    if (selected?.id) {
      saveEncodeDraft({ userId: user?.id, requestId: selected.id, data: nextData })
    }
  }

  const openWalkIn = async () => {
    setError('')
    setMessage('')
    const { data, error: servicesError } = await supabase.from('service_types')
      .select('id, name, queue_prefix').eq('active', true).order('name')
    if (servicesError) { setError(servicesError.message); return }
    setWalkInServices(data || [])
    setWalkInOpen(true)
  }

  const selectWalkInService = (serviceId) => {
    const service = walkInServices.find((s) => s.id === serviceId)
    if (!service) return
    const draft = {
      id: crypto.randomUUID(), patient_id: crypto.randomUUID(),
      service_type_id: service.id, service_types: service,
      patients: {}, status: 'Awaiting Encoding',
      intake_data: { source: 'walk_in', line_joined_at: new Date().toISOString() },
    }
    const initial = buildFormFromRow(draft)
    setFormData(initial)
    formDataRef.current = initial
    setWalkInDraft(draft)
    setWalkInOpen(false)
    setInvalidField(null)
  }

  const handleSaveEncode = async () => {
    if (!selected || saving) return
    if (!online) { setError('Connect to the internet to save encoding.'); return }
    const snapshot = formDataRef.current
    const missingName = walkInDraft && [['first_name', 'First name'], ['last_name', 'Last name']]
      .find(([name]) => !String(snapshot[name] || '').trim())
    const missingField = missingName || findMissingEncodeField(snapshot, useOfficialForm ? charterKey : serviceKind)
    if (missingField) {
      setError(`Required field missing: ${missingField[1]}. Please complete the form before saving.`)
      setMessage('')
      setInvalidField({ name: missingField[0], label: missingField[1] })
      return
    }
    setInvalidField(null)
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const patientId = selected.patient_id || selected.patients?.id
      let patientPatch = null
      if (patientId) {
        const fullName = [snapshot.first_name, snapshot.middle_name, snapshot.last_name]
          .filter(Boolean)
          .join(' ')
          .trim()
        patientPatch = {
            first_name: snapshot.first_name || null,
            middle_name: snapshot.middle_name || null,
            last_name: snapshot.last_name || null,
            name: fullName || selected.patients?.name || 'Patient',
            birthdate: snapshot.birthdate || null,
            sex: snapshot.sex || null,
            civil_status: snapshot.civil_status || null,
            blood_type: snapshot.blood_type || null,
            religion: snapshot.religion || null,
            mother_maiden_name: snapshot.mother_maiden_name || null,
            mobile_phone: snapshot.mobile_phone || null,
            phone: snapshot.mobile_phone || null,
            philhealth_number: snapshot.philhealth_number || null,
            education: snapshot.education || null,
            occupation: snapshot.occupation || null,
            disability: snapshot.disability || null,
            house_no_purok: snapshot.house_no_purok || null,
            barangay: snapshot.barangay || null,
            municipality: snapshot.municipality || 'Pila',
            province: snapshot.province || 'Laguna',
            updated_at: new Date().toISOString(),
        }
        if (!walkInDraft) {
          const { error: patientError } = await supabase.from('patients').update(patientPatch).eq('id', patientId)
          if (patientError) throw patientError
        }
      }

      const prevIntake =
        selected.intake_data && typeof selected.intake_data === 'object' && !Array.isArray(selected.intake_data)
          ? selected.intake_data
          : {}
      const nextIntake = {
        ...prevIntake,
        ...pickIntakeRootFields(snapshot),
        staff_encode: snapshot,
        encoded_by: user?.id || null,
        encoded_at: new Date().toISOString(),
      }

      const { data: updatedRequest, error: updateError } = walkInDraft
        ? await supabase.rpc('save_bhw_walk_in', {
            p_request_id: selected.id, p_patient_id: patientId,
            p_service_type_id: selected.service_type_id,
            p_patient_data: patientPatch, p_intake_data: nextIntake,
          })
        : await supabase
        .from('service_requests')
        .update({
          status: 'Encoded',
          intake_data: nextIntake,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selected.id)
        .in('status', AWAITING_STATUSES)
        .select('id')
        .maybeSingle()
      if (updateError) throw updateError
      if (!updatedRequest) {
        await refresh({ silent: true })
        throw new Error('This request was cancelled or has already left the encode line.')
      }

      void logAuditEvent({
        action: 'staff_encode_visit',
        entityType: 'service_requests',
        entityId: selected.id,
        metadata: { service_kind: serviceKind, service_code: serviceCode },
      })

      if (user?.id) {
        setEncoderNames((prev) => ({
          ...prev,
          [user.id]: (profile?.name || '').trim() || prev[user.id] || 'You',
        }))
      }

      // Keep typed values; only patch local row status/intake so Get Queue Number unlocks.
      clearEncodeDraft({ userId: user?.id, requestId: selected.id })
      setFormData(snapshot)
      setRows((prev) =>
        (walkInDraft && !prev.some((r) => r.id === selected.id)
          ? [...prev, { ...selected, patients: { id: patientId, ...patientPatch } }] : prev).map((r) =>
          r.id === selected.id
            ? { ...r, status: 'Encoded', intake_data: nextIntake, updated_at: new Date().toISOString() }
            : r,
        ),
      )
      if (walkInDraft) {
        hydratedForId.current = selected.id
        setSelectedId(selected.id)
        setWalkInDraft(null)
      }
      void notifyPatient({
        patientId: patientId || selected.patient_id,
        serviceRequestId: selected.id,
        title: 'Details encoded',
        message: 'Your information and vital signs have been encoded by the RHU staff. Your queue number will be issued shortly.',
        type: 'encoding_complete',
      })
      setMessage('Encoding saved. You can now issue a queue number.')
    } catch (e) {
      setError(e?.message || 'Failed to save encoding.')
    } finally {
      setSaving(false)
    }
  }

  const handleGetQueueNumber = async () => {
    if (!selected) return
    if (selected.status !== 'Encoded') {
      setError('Save encoding first before issuing a queue number.')
      return
    }

    const snapshot = formDataRef.current
    setIssuing(true)
    setError('')
    setMessage('')
    try {
      const patientName =
        [snapshot.first_name, snapshot.middle_name, snapshot.last_name].filter(Boolean).join(' ').trim() ||
        displayName(selected)
      const patientId = selected.patient_id || selected.patients?.id || null
      const phone = snapshot.mobile_phone || selected.patients?.mobile_phone || selected.patients?.phone || null
      const reason =
        snapshot.join_reason ||
        selected.intake_data?.join_reason ||
        `${serviceName || 'Service'} — encoded`

      const priority = resolvePatientPriority({
        birthdate: snapshot.birthdate || selected.patients?.birthdate,
        disability: snapshot.disability || selected.patients?.disability,
        is_senior: selected.intake_data?.is_senior,
        is_pwd: selected.intake_data?.is_pwd,
        is_priority: selected.intake_data?.is_priority,
        priority_labels: selected.intake_data?.priority_labels,
      })

      const { label, row } = await createWalkIn({
        patientName,
        phoneNumber: phone,
        reason,
        serviceCode,
        serviceName,
        patientId,
        serviceId: selected.service_type_id || selected.service_types?.id || null,
        serviceRequestId: selected.id,
        assignedStaffId: user?.id || null,
        counterRoom: serviceKind ? 'Doctor Consult' : 'Service Desk',
        isPriority: priority.isPriority,
        priorityLabels: priority.labels,
      })

      // Queue row is local-first. Push it to Supabase BEFORE setting queue_id on
      // service_requests (FK would fail if the remote queue row does not exist yet).
      if (online) {
        const syncResult = await syncNow()
        if (!syncResult?.ok) {
          if (syncResult?.reason === 'busy') {
            // Brief wait then retry once
            await new Promise((r) => setTimeout(r, 400))
            const retry = await syncNow()
            if (!retry?.ok) {
              throw new Error(
                retry?.error ||
                  'Could not sync queue ticket. Wait a moment and try Get Queue Number again.',
              )
            }
          } else {
            throw new Error(
              syncResult?.error ||
                syncResult?.reason ||
                'Could not sync queue ticket online. Check your connection and try again.',
            )
          }
        }
      }

      const { error: linkError } = await supabase
        .from('service_requests')
        .update({
          status: 'In Queue',
          current_status: 'waiting',
          queue_id: row.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', selected.id)

      if (linkError) {
        // Offline / delayed sync: still allow status change without FK if needed
        if (/foreign key|queue_id/i.test(linkError.message || '')) {
          const { error: statusOnlyError } = await supabase
            .from('service_requests')
            .update({
              status: 'In Queue',
              current_status: 'waiting',
              updated_at: new Date().toISOString(),
            })
            .eq('id', selected.id)
          if (statusOnlyError) throw statusOnlyError
          if (online) {
            throw new Error(
              `Queue ticket ${label} was created but not linked yet (${linkError.message}). Sync again from Queue.`,
            )
          }
        } else {
          throw linkError
        }
      }

      void logAuditEvent({
        action: 'staff_issue_queue_number',
        entityType: 'queue',
        entityId: row.id,
        metadata: {
          queue_label: label,
          service_request_id: selected.id,
          service_code: serviceCode,
        },
      })

      setMessage(
        `Queue number issued: ${label}. Patient moves to ${serviceKind ? 'Doctor Consult' : 'Service Desk'} queue.`,
      )
      void notifyPatient({
        patientId,
        queueId: row.id,
        serviceRequestId: selected.id,
        title: 'Queue number issued',
        message: `Your queue number is ${label}. Please wait for the next queue update.`,
        type: 'queue_issued',
      })
      hydratedForId.current = ''
      clearEncodeDraft({ userId: user?.id, requestId: selected.id })
      setSelectedId('')
      setFormData({})
      await refresh({ silent: true })
    } catch (e) {
      setError(e?.message || 'Failed to issue queue number.')
    } finally {
      setIssuing(false)
    }
  }

  const closeEncodeModal = () => {
    if (saving || issuing) return
    if (walkInDraft) clearEncodeDraft({ userId: user?.id, requestId: walkInDraft.id })
    setWalkInDraft(null)
    hydratedForId.current = ''
    setSelectedId('')
    setFormData({})
    setInvalidField(null)
  }

  const formTitle = useMemo(() => {
    if (charterKey === 'health_card_issuance') return 'Encode Health Certificate (Food / Non-Food)'
    if (charterKey === 'sanitary_permit_issuance') return 'Encode Sanitary Permit'
    if (charterKey === 'exhumation_cremation_transfer_permit') {
      return 'Encode Exhumation / Cremation / Transfer Permit'
    }
    if (charterKey === 'review_death_certificate') return 'Encode Review of Death Certificate'
    if (serviceKind === 'animal_bite') return 'Encode Animal Bite details'
    if (serviceKind === 'tb') return 'Encode Tuberculosis details'
    if (serviceKind === 'outpatient' || serviceKind === 'opd') return 'Encode Outpatient details'
    if (serviceKind === 'medcert') return 'Encode Medical Certificate details'
    return serviceName ? `Encode ${serviceName} details` : 'Encode Service Details'
  }, [charterKey, serviceKind, serviceName])

  return (
    <section className="module-card space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="module-title">Encode Desk (BHW / Volunteer)</h2>
          <p className="module-subtitle">
            Patients who tapped <strong>Get in line</strong> wait here. Priority (Senior/PWD) first, then regular —
            both lanes are first-come, first-served. Open a patient to encode, then press <strong>Get Queue Number</strong>.
          </p>
        </div>
        <button
          type="button"
          className="secondary-btn !mt-0"
          onClick={() => void refresh({ silent: false })}
          disabled={loading || Boolean(selectedId)}
          title={selectedId ? 'Close the encode form first to refresh the list' : undefined}
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="primary-btn !mt-0" disabled={!online || Boolean(selected)} onClick={() => void openWalkIn()}>
          Add walk-in
        </button>
        <span className="text-sm text-slate-600">Choose a service, complete its form, then issue a queue number.</span>
      </div>
      {walkInOpen ? (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 space-y-3">
          <label className="field-label" htmlFor="encode-walk-in-service">Walk-in service</label>
          <select id="encode-walk-in-service" className="field-input" value="" onChange={(e) => selectWalkInService(e.target.value)}>
            <option value="">Select a service to open its encode form</option>
            {walkInServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
          {!walkInServices.length ? <p className="text-sm">No active services available.</p> : null}
          <button type="button" className="secondary-btn" onClick={() => setWalkInOpen(false)}>Cancel</button>
        </div>
      ) : null}
      {error ? <p className="error-banner">{error}</p> : null}
      {message ? <p className="info-banner">{message}</p> : null}
      {loading ? <p className="info-banner">Loading encode line…</p> : null}
      {!loading && stuckCount > 0 ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {stuckCount} patient{stuckCount === 1 ? '' : 's'} waiting over {STUCK_WAIT_MINUTES} minutes for encoding.
        </p>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Encode line — top is Next ({filteredRows.length})
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              className="field-input w-full text-sm sm:w-56"
              placeholder="Search name, barangay, ref…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search encode line"
            />
            <select
              className="field-input w-full text-sm sm:w-auto"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="Awaiting Encoding">Awaiting Encoding</option>
              <option value="Encoded">Encoded</option>
            </select>
          </div>
        </div>
        {filteredRows.length === 0 && !loading ? (
          <ModuleEmptyState
            title="No matches"
            description="Try another name, barangay, reference number, or clear the status filter."
          />
        ) : (
          <div className="flex max-w-2xl flex-col gap-2">
            {filteredRows.map((row, index) => {
              const kind = resolveDoctorServiceKind({
                serviceCode: row.service_types?.queue_prefix || 'RHU',
                serviceName: row.service_types?.name || '',
              })
              const wait = formatWaitAge(row.created_at)
              const encodedById = row?.intake_data?.encoded_by
              const encodedAt = row?.intake_data?.encoded_at
              const encoderLabel =
                row.status === 'Encoded' && encodedById
                  ? encoderNames[encodedById] || 'Staff'
                  : ''
              const priority = resolvePatientPriority({
                birthdate: row.patients?.birthdate,
                disability: row.patients?.disability || row.intake_data?.staff_encode?.disability,
                is_senior: row.intake_data?.is_senior,
                is_pwd: row.intake_data?.is_pwd,
                is_priority: row.intake_data?.is_priority,
                priority_labels: row.intake_data?.priority_labels,
              })
              const position = linePositionLabel(index)
              const isNext = index === 0
              void nowTick
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={`flex w-full items-stretch gap-3 rounded-xl border bg-white px-3 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50/60 ${
                    isNext
                        ? 'border-teal-400 ring-2 ring-teal-200'
                        : wait.stuck && row.status === 'Awaiting Encoding'
                          ? 'border-amber-300 ring-1 ring-amber-200'
                          : priority.isPriority
                            ? 'border-violet-300 ring-1 ring-violet-200'
                            : 'border-slate-200'
                  }`}
                >
                  <div
                    className={`flex w-16 shrink-0 flex-col items-center justify-center rounded-lg px-1 py-2 text-center ${
                      isNext ? 'bg-teal-700 text-white' : priority.isPriority ? 'bg-violet-100 text-violet-900' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <span className="text-xs font-extrabold leading-tight">{position}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-slate-900">{displayName(row)}</p>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {wait.label ? (
                          <span
                            className={`text-[11px] font-semibold ${
                              wait.stuck && row.status === 'Awaiting Encoding' ? 'text-amber-800' : 'text-slate-400'
                            }`}
                            title={row.created_at || undefined}
                          >
                            {wait.label}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">{row.service_types?.name || 'Service'}</p>
                    {row.patients?.barangay ? (
                      <p className="mt-0.5 text-[11px] text-slate-400">{row.patients.barangay}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                          row.status === 'Encoded'
                            ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-200'
                            : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                        }`}
                      >
                        {row.status}
                      </span>
                      {kind ? (
                        <span className="text-[11px] font-medium text-slate-400">{kind.replaceAll('_', ' ')}</span>
                      ) : null}
                      {priority.isPriority ? (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-800 ring-1 ring-violet-200">
                          Priority · {priority.label}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                          Regular
                        </span>
                      )}
                    </div>
                    {encoderLabel ? (
                      <p className="mt-2 text-[11px] text-slate-500">
                        Encoded by {encoderLabel}
                        {encodedAt ? ` · ${formatEncodedAt(encodedAt)}` : ''}
                      </p>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <EncodeServiceFormModal
        showDiagnosis={false}
        showMedicalCertificatePurposes={serviceKind === 'medcert'}
        open={Boolean(selected)}
        onClose={closeEncodeModal}
        title={formTitle}
        subtitle={selected ? `${displayName(selected)} · ${serviceCode}` : ''}
        serviceKind={serviceKind}
        serviceName={serviceName}
        status={selected?.status || ''}
        joinReason={formData.join_reason || ''}
        formData={formData}
        onFormChange={handleDraftFormChange}
        error={error}
        message={message}
        saving={saving}
        issuing={issuing}
        onSave={() => void handleSaveEncode()}
        onIssueQueue={() => void handleGetQueueNumber()}
        canIssueQueue={selected?.status === 'Encoded'}
        encodedByName={
          selected?.intake_data?.encoded_by
            ? encoderNames[selected.intake_data.encoded_by] || ''
            : ''
        }
        encodedAt={formatEncodedAt(selected?.intake_data?.encoded_at)}
        invalidField={invalidField}
      >
        {useOfficialForm ? (
          <OfficialServiceEncodeForm charterKey={charterKey} data={formData} onChange={handleDraftFormChange} />
        ) : null}
      </EncodeServiceFormModal>
    </section>
  )
}
