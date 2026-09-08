import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import { logAuditEvent, supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/useAuth'
import { useConfirm } from '../../context/ConfirmContext'
import { generateClinicalSummary, generateSmartDiagnosis } from '../../lib/ai'
import ReactMarkdown from 'react-markdown'
import OutpatientLegacyForm from '../../components/OutpatientLegacyForm'
import AnimalBiteLegacyForm from '../../components/AnimalBiteLegacyForm'
import TbLegacyForm from '../../components/TbLegacyForm'
import { isOnline } from '../../lib/offline/connectivity'
import {
  listPatientsCache,
  upsertPatientsCache,
  PATIENTS_CACHE_SELECT,
} from '../../lib/offline/patientsCacheService'
import useBodyScrollLock from '../../hooks/useBodyScrollLock'
import ModalPortal from '../../components/ModalPortal'

const PILA_BARANGAYS = [
  'Aplaya',
  'Bagong Pook',
  'Bukal',
  'Bulilan Norte (Pob.)',
  'Bulilan Sur (Pob.)',
  'Concepcion',
  'Labuin',
  'Linga',
  'Masico',
  'Mojon',
  'Pansol',
  'Pinagbayanan',
  'San Antonio',
  'San Miguel',
  'Sta. Clara Norte (Pob.)',
  'Sta. Clara Sur (Pob.)',
  'Tubuan',
]

/** List view columns — avoid select('*') on unbounded loads. Full row fetched on edit. */
const PATIENT_RECORD_LIST_SELECT = [
  'id',
  'patient_id',
  'patient_name',
  'first_name',
  'middle_name',
  'last_name',
  'diagnosis',
  'notes',
  'barangay',
  'municipality',
  'age',
  'sex',
  'date_of_consultation',
  'created_at',
  'workflow_status',
  'appointment_id',
  'queue_id',
  'archived_at',
  'wt',
  'temp',
  'bp',
  'pr_hr',
  'rr',
  'spo2',
].join(', ')

const PATIENTS_PAGE_SIZE = 100
const RECORDS_PAGE_SIZE = 100

const emptyFormData = {
  first_name: '',
  middle_name: '',
  last_name: '',
  philhealth_number: '',
  age: '',
  sex: '',
  birthdate: '',
  mother_maiden_name: '',
  civil_status: '',
  religion: '',
  blood_type: '',
  mobile_phone: '',
  mobile_phone_has: 'No',
  mobile_phone_number: '',
  education: '',
  occupation: '',
  disability: '',
  pwd_status: 'No',
  pwd_specify: '',
  house_no_purok: '',
  barangay: '',
  municipality: 'Pila',
  province: 'Laguna',
  member_name: '',
  member_birthdate: '',
  medcert_pwd: false,
  medcert_work: false,
  medcert_financial: false,
  medcert_4ps: false,
  medcert_school: false,
  medcert_others: '',
  date_of_consultation: '',
  wt: '',
  temp: '',
  bp: '',
  pr_hr: '',
  rr: '',
  ht: '',
  spo2: '',
  waist: '',
  hip: '',
  operation_name: '',
  operation_date: '',
  female_age_first_menses: '',
  lmp: '',
  gravida: '',
  para: '',
  cs_date: '',
  nsd_date: '',
  female_age_first_pregnancy: '',
  menopausal_age: '',
  diagnosis: '',
  prescription: '',
  notes: '',
  bite_place: '',
  animal_type: '',
  bite_type: '',
  bite_site: '',
  covid_pfizer: false,
  covid_gamaleya: false,
  covid_jj: false,
  covid_sinovac: false,
  covid_astrazeneca: false,
  covid_moderna: false,
  covid_vaccine_date: '',
  other_vaccines: '',
  flu_vaccine_date: '',
  pneumo_vaccine_date: '',
  td_vaccine_date: '',
  latitude: '',
  longitude: '',
  diagnosing_facility: '',
  ntp_facility_code: '',
  facility_province: '',
  facility_region: '',
  permanent_address: '',
  current_address: '',
  tb_referred_by: '',
  tb_screening_mode: '',
  tb_screening_date: '',
  lab_xpert_date: '',
  lab_xpert_result: '',
  lab_smear_date: '',
  lab_smear_result: '',
  lab_xray_date: '',
  lab_xray_result: '',
  lab_tst_date: '',
  lab_tst_result: '',
  tb_diagnosis: '',
  tb_date_of_diagnosis: '',
  tb_date_of_notification: '',
  tb_case_number: '',
  tb_physician: '',
  tb_referred_to: '',
  tb_bacteriological_status: '',
  tb_anatomical_site: '',
  tb_extra_pulmonary_site: '',
  tb_drug_resistance: '',
  tb_registration_group: '',
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

export default function PatientsPage() {
  const { user, role } = useAuth()
  const { confirm } = useConfirm()
  const location = useLocation()
  const navigate = useNavigate()
  const [patients, setPatients] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState(() => (location.state?.searchQuery ?? '').toString())
  const [showForm, setShowForm] = useState(false)
  const formScrollRef = useRef(null)
  const [formMode, setFormMode] = useState('create')
  const [editingRecordId, setEditingRecordId] = useState(null)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [expandedRecordId, setExpandedRecordId] = useState(null)
  const [formData, setFormData] = useState(() => ({ ...emptyFormData }))
  const [appointmentContext, setAppointmentContext] = useState(null)
  
  // AI States
  const [aiSummaryMap, setAiSummaryMap] = useState({})
  const [generatingSummaryId, setGeneratingSummaryId] = useState(null)
  
  const [aiDiagnosis, setAiDiagnosis] = useState('')
  const [generatingDiagnosis, setGeneratingDiagnosis] = useState(false)
  const [recordsOffset, setRecordsOffset] = useState(0)
  const [patientsOffset, setPatientsOffset] = useState(0)
  const [hasMoreRecords, setHasMoreRecords] = useState(false)
  const [hasMorePatients, setHasMorePatients] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useBodyScrollLock(showForm || expandedRecordId !== null)

  useEffect(() => {
    if (!showForm) return undefined
    const frame = window.requestAnimationFrame(() => {
      if (formScrollRef.current) formScrollRef.current.scrollTop = 0
    })
    return () => window.cancelAnimationFrame(frame)
  }, [showForm, editingRecordId])

  useEffect(() => {
    if (!expandedRecordId) return undefined
    const frame = window.requestAnimationFrame(() => {
      document.querySelectorAll('.patient-record-details-scroll').forEach((container) => {
        container.scrollTop = 0
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [expandedRecordId])

  const fetchPatientPage = useCallback(async (from = 0) => {
    if (!isOnline()) {
      const rows = await listPatientsCache({ limit: PATIENTS_PAGE_SIZE, offset: from })
      return {
        data: rows.map((r) => ({
          id: r.id,
          name: r.name,
          queue_id: r.queue_id,
          created_at: r.created_at,
          archived_at: r.archived_at,
          patient_number: r.patient_number,
          barangay: r.barangay,
        })),
        error: null,
        fromCache: true,
      }
    }

    const result = await supabase
      .from('patients')
      .select(PATIENTS_CACHE_SELECT)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .range(from, from + PATIENTS_PAGE_SIZE - 1)

    if (!result.error && Array.isArray(result.data)) {
      void upsertPatientsCache(result.data)
    }

    // Map to list shape used by the page UI
    if (result.data) {
      result.data = result.data.map((r) => ({
        id: r.id,
        name: r.name || [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ').trim() || 'Patient',
        queue_id: r.queue_id,
        created_at: r.created_at,
        archived_at: r.archived_at,
        patient_number: r.patient_number,
        barangay: r.barangay,
      }))
    }

    return result
  }, [])

  const fetchRecordsPage = useCallback(async (from = 0) => {
    return supabase
      .from('patient_records')
      .select(PATIENT_RECORD_LIST_SELECT)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .range(from, from + RECORDS_PAGE_SIZE - 1)
  }, [])

  const handleGenerateSummary = async (entry) => {
    setGeneratingSummaryId(entry.patientId || entry.key)
    try {
      const info = { name: entry.name, queue_id: entry.queue_id }
      // Pass only the most critical info to save tokens
      const compactRecords = entry.records.map(r => ({
        date: r.date_of_consultation || r.created_at,
        diagnosis: r.diagnosis,
        notes: r.notes,
        vitals: { wt: r.wt, bp: r.bp, hr: r.pr_hr, temp: r.temp }
      }))
      const summary = await generateClinicalSummary(info, compactRecords)
      setAiSummaryMap(prev => ({ ...prev, [entry.patientId || entry.key]: summary }))
    } catch (err) {
      console.error(err)
      setAiSummaryMap(prev => ({ ...prev, [entry.patientId || entry.key]: 'Failed to generate summary.' }))
    } finally {
      setGeneratingSummaryId(null)
    }
  }

  const handleGenerateSmartDiagnosis = async (record) => {
    if (!record) return
    setGeneratingDiagnosis(true)
    try {
      const vitals = { wt: record.wt, temp: record.temp, bp: record.bp, hr: record.pr_hr, rr: record.rr, spo2: record.spo2 }
      const symptoms = record.notes || 'No notes provided by nurse.'
      const diag = await generateSmartDiagnosis(symptoms, vitals)
      setAiDiagnosis(diag)
    } catch (err) {
      console.error(err)
      setAiDiagnosis('Failed to generate diagnosis suggestion.')
    } finally {
      setGeneratingDiagnosis(false)
    }
  }

  useEffect(() => {
    const loadOnMount = async () => {
      const [patientsResult, recordsResult] = await Promise.all([
        fetchPatientPage(0),
        isOnline()
          ? fetchRecordsPage(0)
          : Promise.resolve({
              data: [],
              error: { message: 'Offline — showing cached patients. Consultation records need a connection.' },
            }),
      ])

      const patientsError = patientsResult.error?.message ?? ''
      const recordsError = recordsResult.error?.message ?? ''
      const combinedError =
        [recordsError, patientsError].filter(Boolean).join(' | ') || ''

      if (combinedError) {
        setError(combinedError)
      }

      const nextPatients = patientsResult.data ?? []
      const nextRecords = recordsResult.data ?? []
      setPatients(nextPatients)
      setRecords(nextRecords)
      setPatientsOffset(nextPatients.length)
      setRecordsOffset(nextRecords.length)
      setHasMorePatients(nextPatients.length >= PATIENTS_PAGE_SIZE)
      setHasMoreRecords(isOnline() && nextRecords.length >= RECORDS_PAGE_SIZE)
      setLoading(false)
    }

    loadOnMount()
  }, [fetchPatientPage, fetchRecordsPage])

  const reloadData = async () => {
    setLoading(true)
    setError('')

    const [patientsResult, recordsResult] = await Promise.all([
      fetchPatientPage(0),
      isOnline()
        ? fetchRecordsPage(0)
        : Promise.resolve({
            data: [],
            error: { message: 'Offline — showing cached patients. Consultation records need a connection.' },
          }),
    ])

    const patientsError = patientsResult.error?.message ?? ''
    const recordsError = recordsResult.error?.message ?? ''
    const combinedError =
      [recordsError, patientsError].filter(Boolean).join(' | ') || ''
    if (combinedError) {
      setError(combinedError)
    }

    const nextPatients = patientsResult.data ?? []
    const nextRecords = recordsResult.data ?? []
    setPatients(nextPatients)
    setRecords(nextRecords)
    setPatientsOffset(nextPatients.length)
    setRecordsOffset(nextRecords.length)
    setHasMorePatients(nextPatients.length >= PATIENTS_PAGE_SIZE)
    setHasMoreRecords(isOnline() && nextRecords.length >= RECORDS_PAGE_SIZE)
    setLoading(false)
  }

  const loadMore = async () => {
    if (loadingMore || (!hasMoreRecords && !hasMorePatients)) return
    setLoadingMore(true)
    setError('')
    try {
      const tasks = []
      if (hasMorePatients) tasks.push(fetchPatientPage(patientsOffset).then((r) => ({ kind: 'patients', r })))
      if (hasMoreRecords) tasks.push(fetchRecordsPage(recordsOffset).then((r) => ({ kind: 'records', r })))
      const results = await Promise.all(tasks)
      for (const item of results) {
        if (item.r.error) {
          setError(item.r.error.message)
          continue
        }
        const rows = item.r.data ?? []
        if (item.kind === 'patients') {
          setPatients((prev) => [...prev, ...rows])
          setPatientsOffset((prev) => prev + rows.length)
          setHasMorePatients(rows.length >= PATIENTS_PAGE_SIZE)
        } else {
          setRecords((prev) => {
            const seen = new Set(prev.map((row) => row.id))
            return [...prev, ...rows.filter((row) => !seen.has(row.id))]
          })
          setRecordsOffset((prev) => prev + rows.length)
          setHasMoreRecords(rows.length >= RECORDS_PAGE_SIZE)
        }
      }
    } finally {
      setLoadingMore(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const normalizeName = (value) => (value ?? '').toString().trim().toLowerCase()
  const normalizeLocationValue = (value) => (value ?? '').toString().trim().replace(/\s+/g, ' ').toLowerCase()
  const splitFullName = (value) => {
    const raw = (value ?? '').toString().trim()
    if (!raw) return { first: '', middle: '', last: '' }
    const tokens = raw.split(/\s+/).filter(Boolean)
    if (tokens.length === 1) return { first: tokens[0], middle: '', last: '' }
    if (tokens.length === 2) return { first: tokens[0], middle: '', last: tokens[1] }
    return { first: tokens[0], middle: tokens.slice(1, -1).join(' '), last: tokens[tokens.length - 1] }
  }
  const todayDate = () => new Date().toISOString().slice(0, 10)
  const computeAgeFromBirthdate = useCallback((birthdateValue) => {
    const raw = (birthdateValue ?? '').toString().trim()
    if (!raw) return ''
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return ''
    const today = new Date()
    let age = today.getFullYear() - parsed.getFullYear()
    const monthDiff = today.getMonth() - parsed.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsed.getDate())) {
      age -= 1
    }
    return age >= 0 ? String(age) : ''
  }, [])
  const isLatLngWithinPila = (lat, lng) => {
    const minLat = 14.2
    const maxLat = 14.27
    const minLng = 121.33
    const maxLng = 121.4
    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng
  }

  const readCoordsCache = () => {
    try {
      const raw = window.localStorage.getItem('ht_barangay_coords_v1')
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  const writeCoordsCache = (cache) => {
    try {
      window.localStorage.setItem('ht_barangay_coords_v1', JSON.stringify(cache))
    } catch {
      // ignore
    }
  }

  const resolveBarangayCoords = async ({ barangay, municipality, province }) => {
    try {
      const normalizedBarangay = normalizeLocationValue(barangay)
      const normalizedMunicipality = normalizeLocationValue(municipality || 'Pila')
      const normalizedProvince = normalizeLocationValue(province || 'Laguna')
      if (!normalizedBarangay) return null

      const cacheKey = `${normalizedBarangay}|${normalizedMunicipality}|${normalizedProvince}`
      const cache = readCoordsCache()
      const cached = cache?.[cacheKey]
      if (cached && typeof cached === 'object') {
        const lat = Number(cached.lat)
        const lng = Number(cached.lng)
        if (Number.isFinite(lat) && Number.isFinite(lng) && isLatLngWithinPila(lat, lng)) {
          return { lat, lng }
        }
      }

      const queryText = `${barangay}, ${municipality || 'Pila'}, ${province || 'Laguna'}, Philippines`
      const viewbox = '121.33,14.27,121.4,14.2'
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(
        queryText,
      )}`

      const response = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!response.ok) return null
      const results = await response.json()
      const first = Array.isArray(results) ? results[0] : null
      const lat = first?.lat ? Number(first.lat) : null
      const lng = first?.lon ? Number(first.lon) : null
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isLatLngWithinPila(lat, lng)) return null

      const nextCache = { ...cache, [cacheKey]: { lat, lng } }
      writeCoordsCache(nextCache)
      return { lat, lng }
    } catch {
      return null
    }
  }

  const patientEntries = useMemo(() => {
    const entriesMap = new Map()

    patients.forEach((patient) => {
      const name = (patient.name ?? '').toString().trim()
      const normalized = normalizeName(name)
      const key = normalized || `patient:${patient.id}`

      entriesMap.set(key, {
        key,
        patientId: patient.id,
        name,
        queue_id: patient.queue_id ?? '',
        created_at: patient.created_at ?? null,
        records: [],
      })
    })

    records.forEach((record) => {
      const name = (record.patient_name ?? '').toString().trim()
      const normalized = normalizeName(name)
      const key = normalized || `record:${record.id}`

      if (!entriesMap.has(key)) {
        entriesMap.set(key, {
          key,
          patientId: null,
          name,
          queue_id: '',
          created_at: null,
          records: [],
        })
      }

      entriesMap.get(key).records.push(record)
    })

    return Array.from(entriesMap.values())
      .map((entry) => {
        const entryRecords = [...entry.records].sort((a, b) => {
          const aTime = Date.parse(a.created_at ?? '') || 0
          const bTime = Date.parse(b.created_at ?? '') || 0
          return bTime - aTime
        })

        const patientCreatedAt = Date.parse(entry.created_at ?? '') || 0
        const latestRecordAt = Date.parse(entryRecords[0]?.created_at ?? '') || 0
        const latestActivityAt = Math.max(patientCreatedAt, latestRecordAt)

        return {
          ...entry,
          records: entryRecords,
          latestActivityAt,
        }
      })
      .filter((entry) => entry.records.length > 0)
      .sort((a, b) => b.latestActivityAt - a.latestActivityAt)
  }, [patients, records])

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredPatientEntries =
    normalizedQuery.length === 0
      ? patientEntries
      : patientEntries.filter((entry) => {
          const name = (entry.name ?? '').toString().toLowerCase()
          const queueId = (entry.queue_id ?? '').toString().toLowerCase()
          const recordText = entry.records
            .map((record) => `${record.diagnosis ?? ''} ${record.notes ?? ''} ${record.barangay ?? ''} ${record.municipality ?? ''}`)
            .join(' ')
            .toLowerCase()
          return name.includes(normalizedQuery) || queueId.includes(normalizedQuery) || recordText.includes(normalizedQuery)
        })

  const hasAnyData = records.length > 0
  const isDoctor = role === 'Doctor'
  const isNurse = role === 'Nurse'
  const editingRecord = useMemo(
    () => (editingRecordId ? records.find((record) => record.id === editingRecordId) ?? null : null),
    [records, editingRecordId],
  )
  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setFormLoading(true)

    const nowIso = new Date().toISOString()
    const existingRecord = editingRecordId ? records.find((record) => record.id === editingRecordId) ?? null : null
    const appointmentId = appointmentContext?.appointmentId ?? existingRecord?.appointment_id ?? null
    const queueId = appointmentContext?.queueId ?? existingRecord?.queue_id ?? null

    if (isDoctor) {
      const diagnosisText = (formData.diagnosis ?? '').toString().trim()
      const notesText = (formData.notes ?? '').toString().trim()
      const prescriptionText = (formData.prescription ?? '').toString().trim()

      if (!editingRecordId) {
        setFormError('Select a patient record to diagnose.')
        setFormLoading(false)
        return
      }

      if (!diagnosisText) {
        setFormError('Diagnosis is required.')
        setFormLoading(false)
        return
      }

      const { error: updateError } = await supabase
        .from('patient_records')
        .update({
          diagnosis: diagnosisText || null,
          notes: notesText || null,
          prescription: prescriptionText || null,
          workflow_status: 'completed',
          ...(user?.id ? { assigned_doctor_id: user.id } : {}),
          doctor_completed_at: nowIso,
        })
        .eq('id', editingRecordId)

      if (updateError) {
        setFormError(updateError.message)
        setFormLoading(false)
        return
      }

      if (appointmentId) {
        await supabase.from('appointments').update({ status: 'completed', doctor_queue_status: 'done' }).eq('id', appointmentId)
      }

      if (queueId) {
        await supabase.from('queue').update({ status: 'done' }).eq('id', queueId)
      }

      void logAuditEvent({
        action: 'doctor_update_diagnosis',
        entityType: 'patient_records',
        entityId: editingRecordId,
        metadata: { appointment_id: appointmentId ?? null, has_diagnosis: Boolean(diagnosisText) },
      })

      setAppointmentContext(null)
      setFormData({ ...emptyFormData })
      setFormMode('create')
      setEditingRecordId(null)
      setExpandedRecordId(null)
      setShowForm(false)
      setFormLoading(false)
      await reloadData()
      return
    }

    const firstName = (formData.first_name ?? '').toString().trim()
    const middleName = (formData.middle_name ?? '').toString().trim()
    const lastName = (formData.last_name ?? '').toString().trim()
    const patientNameFull = [firstName, middleName, lastName].filter(Boolean).join(' ').trim()
    if (!patientNameFull) {
      setFormError('Patient name is required')
      setFormLoading(false)
      return
    }

    const parseNumber = (value) => {
      const trimmed = (value ?? '').toString().trim()
      if (!trimmed) return null
      const parsed = Number(trimmed)
      return Number.isFinite(parsed) ? parsed : null
    }

    const parseDate = (value) => {
      const trimmed = (value ?? '').toString().trim()
      return trimmed ? trimmed : null
    }



    if ((formData.mobile_phone_has ?? 'No') === 'Yes') {
      const mobileNumber = (formData.mobile_phone_number ?? '').toString().trim()
      if (!mobileNumber) {
        setFormError('Mobile phone number is required when set to Yes.')
        setFormLoading(false)
        return
      }
    }

    if ((formData.pwd_status ?? 'No') === 'Yes') {
      const pwdSpecify = (formData.pwd_specify ?? '').toString().trim()
      if (!pwdSpecify) {
        setFormError('Please specify the disability when PWD is Yes.')
        setFormLoading(false)
        return
      }
    }

    let patientIdToUse = appointmentContext?.patientId ?? existingRecord?.patient_id ?? null
    if (!patientIdToUse) {
      const { data: existingPatients, error: findPatientError } = await supabase
        .from('patients')
        .select('id')
        .ilike('name', patientNameFull)
        .limit(1)

      const foundId = (existingPatients ?? [])[0]?.id ?? null
      if (!findPatientError && foundId) {
        patientIdToUse = foundId
      }

      if (!findPatientError && !patientIdToUse) {
        const { data: createdPatient, error: createPatientError } = await supabase
          .from('patients')
          .insert([{ name: patientNameFull }])
          .select('id')
          .single()

        if (!createPatientError) {
          patientIdToUse = createdPatient?.id ?? null
        }
      }
    }

    const coords = await resolveBarangayCoords({
      barangay: formData.barangay,
      municipality: 'Pila',
      province: 'Laguna',
    })
    const existingLat = parseNumber(formData.latitude)
    const existingLng = parseNumber(formData.longitude)
    const hasExistingCoords =
      Number.isFinite(existingLat) &&
      Number.isFinite(existingLng) &&
      !(existingLat === 0 && existingLng === 0) &&
      isLatLngWithinPila(existingLat, existingLng)
    const finalCoords = coords ?? (hasExistingCoords ? { lat: existingLat, lng: existingLng } : null)

    const covidBrands = [
      formData.covid_pfizer ? 'Pfizer' : '',
      formData.covid_gamaleya ? 'Gamaleya' : '',
      formData.covid_jj ? 'J&J' : '',
      formData.covid_sinovac ? 'Sinovac' : '',
      formData.covid_astrazeneca ? 'AstraZeneca' : '',
      formData.covid_moderna ? 'Moderna' : '',
    ]
      .filter(Boolean)
      .join(', ')

    let patientAuthIdToUse = appointmentContext?.patientAuthId ?? existingRecord?.patient_auth_id ?? null
    if (appointmentId) {
      const { data: appointmentRow, error: appointmentLookupError } = await supabase
        .from('appointments')
        .select('patient_auth_id')
        .eq('id', appointmentId)
        .single()

      if (appointmentLookupError) {
        setFormError(`Unable to verify appointment owner: ${appointmentLookupError.message}`)
        setFormLoading(false)
        return
      }

      patientAuthIdToUse = appointmentRow?.patient_auth_id ?? null
    }

    const mobilePhoneValue =
      (formData.mobile_phone_has ?? 'No') === 'Yes'
        ? (formData.mobile_phone_number ?? '').toString().trim() || null
        : null
    const pwdValue =
      (formData.pwd_status ?? 'No') === 'Yes' ? (formData.pwd_specify ?? '').toString().trim() || null : null

    // Synchronize master patient profile in patients table
    if (patientIdToUse) {
      await supabase.from('patients').update({
        first_name: firstName || null,
        middle_name: middleName || null,
        last_name: lastName || null,
        philhealth_number: formData.philhealth_number.trim() || null,
        sex: formData.sex.trim() || null,
        birthdate: parseDate(formData.birthdate),
        mother_maiden_name: formData.mother_maiden_name.trim() || null,
        civil_status: formData.civil_status.trim() || null,
        religion: formData.religion.trim() || null,
        blood_type: formData.blood_type.trim() || null,
        mobile_phone: mobilePhoneValue,
        education: formData.education.trim() || null,
        occupation: formData.occupation.trim() || null,
        disability: pwdValue,
        house_no_purok: formData.house_no_purok.trim() || null,
        barangay: formData.barangay.trim() || null,
      }).eq('id', patientIdToUse)
    }

    const isAnimalBiteSubmit = formData.notes?.includes('[Animal Bite Record]') || formData.bite_place || formData.animal_type || formData.bite_type || formData.bite_site
    const isTbSubmit = formData.notes?.includes('[TB Treatment Record]') || formData.diagnosing_facility || formData.ntp_facility_code || formData.tb_case_number
    
    // Resolve service_type_id dynamically if not specified
    let resolvedServiceTypeId = appointmentContext?.serviceTypeId ?? existingRecord?.service_type_id ?? null
    if (!resolvedServiceTypeId) {
      const matchName = isAnimalBiteSubmit 
        ? '%Animal Bite%' 
        : isTbSubmit 
          ? '%Tuberculosis%' 
          : '%Outpatient%'
      
      const { data: svcTypeRow } = await supabase
        .from('service_types')
        .select('id')
        .ilike('name', matchName)
        .limit(1)
        .maybeSingle()
      
      if (svcTypeRow) {
        resolvedServiceTypeId = svcTypeRow.id
      }
    }

    let finalNotes = formData.notes || ''
    if (isAnimalBiteSubmit) {
      let cleanNotes = formData.notes || ''
      if (cleanNotes.includes('[Animal Bite Record]')) {
        const parts = cleanNotes.split('Additional Notes:\n')
        cleanNotes = parts[1] || ''
      }
      
      const biteDetails = `[Animal Bite Record]\nPlace of Bite: ${formData.bite_place || ''}\nAnimal Type: ${formData.animal_type || ''}\nBite Type: ${formData.bite_type || ''}\nBite Site: ${formData.bite_site || ''}`
      finalNotes = cleanNotes ? `${biteDetails}\n\nAdditional Notes:\n${cleanNotes}` : biteDetails
    } else if (isTbSubmit) {
      let cleanNotes = formData.notes || ''
      if (cleanNotes.includes('[TB Treatment Record]')) {
        const parts = cleanNotes.split('Additional Notes:\n')
        cleanNotes = parts[1] || ''
      }
      
      const tbDetails = `[TB Treatment Record]\nDiagnosing Facility: ${formData.diagnosing_facility || ''}\nNTP Facility Code: ${formData.ntp_facility_code || ''}\nProvince/HUC: ${formData.facility_province || ''}\nRegion: ${formData.facility_region || ''}\nPermanent Address: ${formData.permanent_address || ''}\nCurrent Address: ${formData.current_address || ''}\nReferred By: ${formData.tb_referred_by || ''}\nMode of Screening: ${formData.tb_screening_mode || ''}\nDate of Screening: ${formData.tb_screening_date || ''}\nLab Xpert Date: ${formData.lab_xpert_date || ''}\nLab Xpert Result: ${formData.lab_xpert_result || ''}\nLab Smear Date: ${formData.lab_smear_date || ''}\nLab Smear Result: ${formData.lab_smear_result || ''}\nLab Xray Date: ${formData.lab_xray_date || ''}\nLab Xray Result: ${formData.lab_xray_result || ''}\nLab TST Date: ${formData.lab_tst_date || ''}\nLab TST Result: ${formData.lab_tst_result || ''}\nDiagnosis: ${formData.tb_diagnosis || ''}\nDate of Diagnosis: ${formData.tb_date_of_diagnosis || ''}\nDate of Notification: ${formData.tb_date_of_notification || ''}\nTB Case Number: ${formData.tb_case_number || ''}\nAttending Physician: ${formData.tb_physician || ''}\nReferred To: ${formData.tb_referred_to || ''}\nBacteriological Status: ${formData.tb_bacteriological_status || ''}\nAnatomical Site: ${formData.tb_anatomical_site || ''}\nExtra-pulmonary Site: ${formData.tb_extra_pulmonary_site || ''}\nDrug Resistance Status: ${formData.tb_drug_resistance || ''}\nRegistration Group: ${formData.tb_registration_group || ''}`
      finalNotes = cleanNotes ? `${tbDetails}\n\nAdditional Notes:\n${cleanNotes}` : tbDetails
    }

    let recordPayload = {
      patient_name: patientNameFull,
      ...(patientIdToUse ? { patient_id: patientIdToUse } : {}),
      ...(patientAuthIdToUse ? { patient_auth_id: patientAuthIdToUse } : {}),
      ...(appointmentId ? { appointment_id: appointmentId } : {}),
      ...(queueId ? { queue_id: queueId } : {}),
      service_type_id: resolvedServiceTypeId,
      first_name: firstName || null,
      middle_name: middleName || null,
      last_name: lastName || null,
      philhealth_number: formData.philhealth_number.trim() || null,
      age: parseNumber(formData.age),
      sex: formData.sex.trim() || null,
      birthdate: parseDate(formData.birthdate),
      mother_maiden_name: formData.mother_maiden_name.trim() || null,
      civil_status: formData.civil_status.trim() || null,
      religion: formData.religion.trim() || null,
      blood_type: formData.blood_type.trim() || null,
      mobile_phone: mobilePhoneValue,
      education: formData.education.trim() || null,
      occupation: formData.occupation.trim() || null,
      disability: pwdValue,
      house_no_purok: formData.house_no_purok.trim() || null,
      barangay: formData.barangay.trim() || null,
      municipality: 'Pila',
      province: 'Laguna',
      member_name: formData.member_name.trim() || null,
      member_birthdate: parseDate(formData.member_birthdate),
      medcert_pwd: Boolean(formData.medcert_pwd),
      medcert_work: Boolean(formData.medcert_work),
      medcert_financial: Boolean(formData.medcert_financial),
      medcert_4ps: Boolean(formData.medcert_4ps),
      medcert_school: Boolean(formData.medcert_school),
      medcert_others: formData.medcert_others.trim() || null,
      date_of_consultation: parseDate(formData.date_of_consultation),
      wt: parseNumber(formData.wt),
      temp: parseNumber(formData.temp),
      bp: formData.bp.trim() || null,
      pr_hr: formData.pr_hr.trim() || null,
      rr: formData.rr.trim() || null,
      ht: parseNumber(formData.ht),
      spo2: parseNumber(formData.spo2),
      waist: parseNumber(formData.waist),
      hip: parseNumber(formData.hip),
      operation_name: formData.operation_name.trim() || null,
      operation_date: parseDate(formData.operation_date),
      female_age_first_menses: parseNumber(formData.female_age_first_menses),
      lmp: parseDate(formData.lmp),
      gravida: parseNumber(formData.gravida),
      para: parseNumber(formData.para),
      cs_date: parseDate(formData.cs_date),
      nsd_date: parseDate(formData.nsd_date),
      female_age_first_pregnancy: parseNumber(formData.female_age_first_pregnancy),
      menopausal_age: parseNumber(formData.menopausal_age),
      diagnosis: formData.diagnosis.trim() || null,
      notes: finalNotes.trim() || null,
      covid_vaccine_brand: covidBrands || null,
      covid_vaccine_date: parseDate(formData.covid_vaccine_date),
      other_vaccines: formData.other_vaccines.trim() || null,
      flu_vaccine_date: parseDate(formData.flu_vaccine_date),
      pneumo_vaccine_date: parseDate(formData.pneumo_vaccine_date),
      td_vaccine_date: parseDate(formData.td_vaccine_date),
      latitude: finalCoords?.lat ?? null,
      longitude: finalCoords?.lng ?? null,
    }

    const shouldSendToDoctor = isNurse && Boolean(appointmentContext?.appointmentId)
    if (shouldSendToDoctor) {
      recordPayload = {
        ...recordPayload,
        // Doctor fills diagnosis later; keep nurse intake notes (incl. AB/TB tags).
        diagnosis: null,
        workflow_status: 'awaiting_doctor',
        assigned_doctor_id: null,
        nurse_completed_at: nowIso,
        doctor_completed_at: null,
      }
    } else {
      recordPayload = {
        ...recordPayload,
        workflow_status: recordPayload.workflow_status ?? 'completed',
      }
    }

    if (formMode === 'edit' && editingRecordId) {
      const { error: updateError } = await supabase.from('patient_records').update(recordPayload).eq('id', editingRecordId)

      if (updateError) {
        setFormError(updateError.message)
        setFormLoading(false)
        return
      }
    } else {
      // OP / TB / Animal Bite all persist on patient_records (notes tags + shared columns).
      // Twin tables outpatient_records / tb_treatment_records / animal_bite_records do not exist.
      if (isTbSubmit) {
        recordPayload = {
          ...recordPayload,
          diagnosis:
            recordPayload.diagnosis ||
            (formData.tb_diagnosis ?? '').toString().trim() ||
            'Tuberculosis',
          tb_classification:
            (formData.tb_registration_group ?? '').toString().trim() ||
            (formData.tb_classification ?? '').toString().trim() ||
            null,
        }
      } else if (isAnimalBiteSubmit) {
        recordPayload = {
          ...recordPayload,
          diagnosis: recordPayload.diagnosis || 'Animal Bite',
        }
      }

      const { error: insertRecordError } = await supabase.from('patient_records').insert([recordPayload])

      if (insertRecordError) {
        setFormError(insertRecordError.message)
        setFormLoading(false)
        return
      }
    }

    if (shouldSendToDoctor && editingRecordId) {
      void logAuditEvent({
        action: 'nurse_send_to_doctor',
        entityType: 'patient_records',
        entityId: editingRecordId,
        metadata: { appointment_id: appointmentId ?? null },
      })
    }

    if (appointmentId) {
      if (shouldSendToDoctor) {
        await supabase
          .from('appointments')
          .update({ doctor_queue_status: 'waiting', ...(patientIdToUse ? { patient_id: patientIdToUse } : {}) })
          .eq('id', appointmentId)
      } else {
        await supabase
          .from('appointments')
          .update({
            status: 'completed',
            doctor_queue_status: 'done',
            ...(patientIdToUse ? { patient_id: patientIdToUse } : {}),
          })
          .eq('id', appointmentId)
      }
    }

    if (queueId) {
      await supabase.from('queue').update({ status: 'done', ...(patientIdToUse ? { patient_id: patientIdToUse } : {}) }).eq('id', queueId)
    }

    setAppointmentContext(null)
    setFormData({ ...emptyFormData })
    setFormMode('create')
    setEditingRecordId(null)
    setShowForm(false)
    setFormLoading(false)
    await reloadData()
  }

  const getFormDataForRecord = useCallback((record) => {
    if (!record) return {}
    const fallbackParts = (() => {
      const raw = (record.patient_name ?? '').toString().trim()
      if (!raw) return { first: '', middle: '', last: '' }
      const tokens = raw.split(/\s+/).filter(Boolean)
      if (tokens.length === 1) return { first: tokens[0], middle: '', last: '' }
      if (tokens.length === 2) return { first: tokens[0], middle: '', last: tokens[1] }
      return { first: tokens[0], middle: tokens.slice(1, -1).join(' '), last: tokens[tokens.length - 1] }
    })()

    const covidBrandText = (record.covid_vaccine_brand ?? '').toString().toLowerCase()
    const birthdateValue = record.birthdate ?? ''
    const disabilityText = (record.disability ?? '').toString().trim()
    const pwdYes = Boolean(disabilityText) && disabilityText.toLowerCase() !== 'none'
    const mobilePhoneText = (record.mobile_phone ?? '').toString().trim()

    const isAnimalBite = (record.notes ?? '').includes('[Animal Bite Record]')
    let bite_place = ''
    let animal_type = ''
    let bite_type = ''
    let bite_site = ''

    const isTb = (record.notes ?? '').includes('[TB Treatment Record]')
    let tbFields = {}

    let cleanNotes = record.notes ?? ''

    if (isAnimalBite) {
      bite_place = record.notes.match(/Place of Bite:\s*(.*)/)?.[1] || ''
      animal_type = record.notes.match(/Animal Type:\s*(.*)/)?.[1] || ''
      bite_type = record.notes.match(/Bite Type:\s*(.*)/)?.[1] || ''
      bite_site = record.notes.match(/Bite Site:\s*(.*)/)?.[1] || ''
      
      const parts = record.notes.split('Additional Notes:\n')
      cleanNotes = parts[1] || ''
    } else if (isTb) {
      const tbKeys = [
        'diagnosing_facility', 'ntp_facility_code', 'facility_province', 'facility_region',
        'permanent_address', 'current_address', 'tb_referred_by', 'tb_screening_mode',
        'tb_screening_date', 'lab_xpert_date', 'lab_xpert_result', 'lab_smear_date',
        'lab_smear_result', 'lab_xray_date', 'lab_xray_result', 'lab_tst_date',
        'lab_tst_result', 'tb_diagnosis', 'tb_date_of_diagnosis', 'tb_date_of_notification',
        'tb_case_number', 'tb_physician', 'tb_referred_to', 'tb_bacteriological_status',
        'tb_anatomical_site', 'tb_extra_pulmonary_site', 'tb_drug_resistance', 'tb_registration_group',
        'nationality'
      ]
      tbKeys.forEach(k => {
        let regex = null
        if (k === 'diagnosing_facility') regex = /Diagnosing Facility:\s*(.*)/
        else if (k === 'ntp_facility_code') regex = /NTP Facility Code:\s*(.*)/
        else if (k === 'facility_province') regex = /Province\/HUC:\s*(.*)/
        else if (k === 'facility_region') regex = /Region:\s*(.*)/
        else if (k === 'permanent_address') regex = /Permanent Address:\s*(.*)/
        else if (k === 'current_address') regex = /Current Address:\s*(.*)/
        else if (k === 'tb_referred_by') regex = /Referred By:\s*(.*)/
        else if (k === 'tb_screening_mode') regex = /Mode of Screening:\s*(.*)/
        else if (k === 'tb_screening_date') regex = /Date of Screening:\s*(.*)/
        else if (k === 'lab_xpert_date') regex = /Lab Xpert Date:\s*(.*)/
        else if (k === 'lab_xpert_result') regex = /Lab Xpert Result:\s*(.*)/
        else if (k === 'lab_smear_date') regex = /Lab Smear Date:\s*(.*)/
        else if (k === 'lab_smear_result') regex = /Lab Smear Result:\s*(.*)/
        else if (k === 'lab_xray_date') regex = /Lab Xray Date:\s*(.*)/
        else if (k === 'lab_xray_result') regex = /Lab Xray Result:\s*(.*)/
        else if (k === 'lab_tst_date') regex = /Lab TST Date:\s*(.*)/
        else if (k === 'lab_tst_result') regex = /Lab TST Result:\s*(.*)/
        else if (k === 'tb_diagnosis') regex = /Diagnosis:\s*(.*)/
        else if (k === 'tb_date_of_diagnosis') regex = /Date of Diagnosis:\s*(.*)/
        else if (k === 'tb_date_of_notification') regex = /Date of Notification:\s*(.*)/
        else if (k === 'tb_case_number') regex = /TB Case Number:\s*(.*)/
        else if (k === 'tb_physician') regex = /Attending Physician:\s*(.*)/
        else if (k === 'tb_referred_to') regex = /Referred To:\s*(.*)/
        else if (k === 'tb_bacteriological_status') regex = /Bacteriological Status:\s*(.*)/
        else if (k === 'tb_anatomical_site') regex = /Anatomical Site:\s*(.*)/
        else if (k === 'tb_extra_pulmonary_site') regex = /Extra-pulmonary Site:\s*(.*)/
        else if (k === 'tb_drug_resistance') regex = /Drug Resistance Status:\s*(.*)/
        else if (k === 'tb_registration_group') regex = /Registration Group:\s*(.*)/
        else if (k === 'nationality') regex = /Nationality:\s*(.*)/

        if (regex) {
          tbFields[k] = record.notes.match(regex)?.[1] || ''
        }
      })
      const parts = record.notes.split('Additional Notes:\n')
      cleanNotes = parts[1] || ''
    }

    return {
      first_name: record.first_name ?? fallbackParts.first,
      middle_name: record.middle_name ?? fallbackParts.middle,
      last_name: record.last_name ?? fallbackParts.last,
      philhealth_number: record.philhealth_number ?? '',
      age: birthdateValue ? computeAgeFromBirthdate(birthdateValue) : record.age?.toString?.() ?? '',
      sex: record.sex ?? '',
      birthdate: birthdateValue,
      mother_maiden_name: record.mother_maiden_name ?? '',
      civil_status: record.civil_status ?? '',
      religion: record.religion ?? '',
      blood_type: record.blood_type ?? '',
      mobile_phone: record.mobile_phone ?? '',
      mobile_phone_has: mobilePhoneText ? 'Yes' : 'No',
      mobile_phone_number: mobilePhoneText,
      education: record.education ?? '',
      occupation: record.occupation ?? '',
      disability: record.disability ?? '',
      pwd_status: pwdYes ? 'Yes' : 'No',
      pwd_specify: pwdYes ? disabilityText : '',
      house_no_purok: record.house_no_purok ?? '',
      barangay: record.barangay ?? '',
      municipality: 'Pila',
      province: 'Laguna',
      member_name: record.member_name ?? '',
      member_birthdate: record.member_birthdate ?? '',
      medcert_pwd: Boolean(record.medcert_pwd),
      medcert_work: Boolean(record.medcert_work),
      medcert_financial: Boolean(record.medcert_financial),
      medcert_4ps: Boolean(record.medcert_4ps),
      medcert_school: Boolean(record.medcert_school),
      medcert_others: record.medcert_others ?? '',
      date_of_consultation: record.date_of_consultation ?? '',
      wt: record.wt?.toString?.() ?? '',
      temp: record.temp?.toString?.() ?? '',
      bp: record.bp ?? '',
      pr_hr: record.pr_hr ?? '',
      rr: record.rr ?? '',
      ht: record.ht?.toString?.() ?? '',
      spo2: record.spo2?.toString?.() ?? '',
      waist: record.waist?.toString?.() ?? '',
      hip: record.hip?.toString?.() ?? '',
      operation_name: record.operation_name ?? '',
      operation_date: record.operation_date ?? '',
      female_age_first_menses: record.female_age_first_menses?.toString?.() ?? '',
      lmp: record.lmp ?? '',
      gravida: record.gravida?.toString?.() ?? '',
      para: record.para?.toString?.() ?? '',
      cs_date: record.cs_date ?? '',
      nsd_date: record.nsd_date ?? '',
      female_age_first_pregnancy: record.female_age_first_pregnancy?.toString?.() ?? '',
      menopausal_age: record.menopausal_age?.toString?.() ?? '',
      diagnosis: record.diagnosis ?? '',
      prescription: record.prescription ?? '',
      notes: isAnimalBite || isTb ? cleanNotes : (record.notes ?? ''),
      bite_place,
      animal_type,
      bite_type,
      bite_site,
      ...tbFields,
      covid_vaccine_brand: record.covid_vaccine_brand ?? '',
      covid_vaccine_date: record.covid_vaccine_date ?? '',
      covid_pfizer: covidBrandText.includes('pfizer'),
      covid_gamaleya: covidBrandText.includes('gamaleya'),
      covid_jj: covidBrandText.includes('j&j') || covidBrandText.includes('janssen'),
      covid_sinovac: covidBrandText.includes('sinovac'),
      covid_astrazeneca: covidBrandText.includes('astrazeneca'),
      covid_moderna: covidBrandText.includes('moderna'),
      other_vaccines: record.other_vaccines ?? '',
      flu_vaccine_date: record.flu_vaccine_date ?? '',
      pneumo_vaccine_date: record.pneumo_vaccine_date ?? '',
      td_vaccine_date: record.td_vaccine_date ?? '',
      latitude: record.latitude?.toString?.() ?? '',
      longitude: record.longitude?.toString?.() ?? '',
    }
  }, [computeAgeFromBirthdate])

  const handleEditRecord = useCallback(async (record) => {
    setFormError('')
    setFormMode('edit')
    setEditingRecordId(record.id)
    setExpandedRecordId(null)
    setShowForm(true)
    setAiDiagnosis('')
    setFormData(getFormDataForRecord(record))
    window.requestAnimationFrame(() => {
      if (formScrollRef.current) formScrollRef.current.scrollTop = 0
    })

    // Hydrate full clinical row for the form (list uses a projected select).
    const { data: full, error: fullError } = await supabase
      .from('patient_records')
      .select('*')
      .eq('id', record.id)
      .maybeSingle()
    if (!fullError && full) {
      setRecords((prev) => prev.map((row) => (row.id === full.id ? full : row)))
      setFormData(getFormDataForRecord(full))
      window.requestAnimationFrame(() => {
        if (formScrollRef.current) formScrollRef.current.scrollTop = 0
      })
    }
  }, [getFormDataForRecord])

  useEffect(() => {
    let isMounted = true

    const applyRouteState = async () => {
      const state = location.state
      if (!state || loading || !isMounted) {
        return
      }

      const nextSearch = (state.searchQuery ?? '').toString().trim()
      if (nextSearch && isMounted) {
        setSearchQuery(nextSearch)
      }

      const consult = state.consultationFromAppointment
      const viewAppointmentId = state.viewAppointmentId
      const editRecordId = state.editRecordId

      if (consult?.appointmentId) {
        setAppointmentContext(consult)
        const existing = records.find((r) => r.appointment_id === consult.appointmentId)
        if (existing) {
          handleEditRecord(existing)
        } else {
          const nameParts = splitFullName(consult.patientName)
          setFormError('')
          setFormMode('create')
          setEditingRecordId(null)
          setExpandedRecordId(null)
          setShowForm(true)
          setFormData({
            ...emptyFormData,
            first_name: nameParts.first,
            middle_name: nameParts.middle,
            last_name: nameParts.last,
            date_of_consultation: consult.appointmentDate || todayDate(),
            notes: '',
          })
        }
        navigate(location.pathname, { replace: true, state: null })
        return
      }

      if (editRecordId) {
        const match = records.find((r) => r.id === editRecordId)
        if (match) {
          handleEditRecord(match)
        }
        navigate(location.pathname, { replace: true, state: null })
        return
      }

      if (viewAppointmentId) {
        let match = records.find((r) => r.appointment_id === viewAppointmentId)
        if (!match) {
          const { data: recordRow, error: lookupError } = await supabase
            .from('patient_records')
            .select('*')
            .eq('appointment_id', viewAppointmentId)
            .is('archived_at', null)
            .maybeSingle()

          if (lookupError) {
            setError(lookupError.message)
          } else if (recordRow) {
            match = recordRow
            setRecords((prev) => {
              const next = Array.isArray(prev) ? prev : []
              const withoutDupes = next.filter((r) => r.id !== recordRow.id)
              return [recordRow, ...withoutDupes]
            })
          }
        }

        if (match) {
          setExpandedRecordId(match.id)
        } else {
          setExpandedRecordId(null)
          setError('No patient record found for this appointment yet.')
        }
        navigate(location.pathname, { replace: true, state: null })
      }
    }

    applyRouteState()

    return () => {
      isMounted = false
    }
  }, [handleEditRecord, loading, location.pathname, location.state, navigate, records, searchQuery])

  const handleArchiveRecord = async (record) => {
    setFormError('')
    const confirmed = await confirm({
      title: 'Archive Patient Record',
      message: 'Archive this patient record? It will be moved to Archive and deleted after 30 days.',
      confirmLabel: 'Archive',
      cancelLabel: 'Cancel',
      type: 'warning',
    })
    if (!confirmed) return

    const { error: archiveError } = await supabase
      .from('patient_records')
      .update({ archived_at: new Date().toISOString(), ...(user?.id ? { archived_by: user.id } : {}) })
      .eq('id', record.id)

    if (archiveError) {
      setError(archiveError.message)
      return
    }

    void logAuditEvent({
      action: 'patient_record_archive',
      entityType: 'patient_records',
      entityId: record.id,
      metadata: { appointment_id: record.appointment_id ?? null },
    })

    if (expandedRecordId === record.id) {
      setExpandedRecordId(null)
    }

    if (editingRecordId === record.id) {
      setShowForm(false)
      setFormMode('create')
      setEditingRecordId(null)
    }

    await reloadData()
  }

  const handleArchivePatient = async (entry) => {
    setFormError('')
    const patientId = entry.patientId
    if (!patientId) {
      setError('Unable to archive: patient ID not found')
      return
    }

    const confirmed = await confirm({
      title: 'Archive Patient',
      message: `Archive patient "${entry.name || 'Unnamed'}" and their consult records? They will move to Archive and be permanently deleted after 30 days.`,
      confirmLabel: 'Archive',
      cancelLabel: 'Cancel',
      type: 'danger',
    })
    if (!confirmed) return

    try {
      const archivedAt = new Date().toISOString()
      const archivePatch = {
        archived_at: archivedAt,
        ...(user?.id ? { archived_by: user.id } : {}),
      }

      const { error: patientArchiveError } = await supabase
        .from('patients')
        .update(archivePatch)
        .eq('id', patientId)
        .is('archived_at', null)

      if (patientArchiveError) {
        setError(`Failed to archive patient: ${patientArchiveError.message}`)
        return
      }

      const { error: recordsArchiveError } = await supabase
        .from('patient_records')
        .update(archivePatch)
        .eq('patient_id', patientId)
        .is('archived_at', null)

      if (recordsArchiveError) {
        setError(`Patient archived, but records failed: ${recordsArchiveError.message}`)
        await reloadData()
        return
      }

      // Soft-archive related active queue / appointment / workflow rows when present.
      await Promise.all([
        supabase.from('queue').update(archivePatch).eq('patient_id', patientId).is('archived_at', null),
        supabase.from('appointments').update(archivePatch).eq('patient_id', patientId).is('archived_at', null),
        supabase.from('service_requests').update(archivePatch).eq('patient_id', patientId).is('archived_at', null),
      ])

      void logAuditEvent({
        action: 'patient_archive',
        entityType: 'patients',
        entityId: patientId,
        metadata: { patient_name: entry.name },
      })

      await reloadData()
    } catch (err) {
      setError(`Error archiving patient: ${err?.message || 'Unknown error'}`)
    }
  }

  const acceptDoctorRecord = async (record) => {
    if (!record) return false
    const currentStatus = (record.workflow_status ?? 'completed').toString()
    if (currentStatus === 'completed') return true

    const nextPatch = {
      workflow_status: 'doctor_in_progress',
      ...(user?.id ? { assigned_doctor_id: user.id } : {}),
    }

    const { error: updateError } = await supabase.from('patient_records').update(nextPatch).eq('id', record.id)
    if (updateError) {
      setError(updateError.message)
      return false
    }

    if (record.appointment_id) {
      await supabase.from('appointments').update({ doctor_queue_status: 'called' }).eq('id', record.appointment_id)
    }

    void logAuditEvent({
      action: 'doctor_accept_record',
      entityType: 'patient_records',
      entityId: record.id,
      metadata: { appointment_id: record.appointment_id ?? null },
    })

    return true
  }

  const toggleViewRecord = (recordId) => {
    setExpandedRecordId((prev) => {
      const next = prev === recordId ? null : recordId
      if (next) {
        void supabase
          .from('patient_records')
          .select('*')
          .eq('id', next)
          .maybeSingle()
          .then(({ data: full, error: fullError }) => {
            if (!fullError && full) {
              setRecords((rows) => rows.map((row) => (row.id === full.id ? full : row)))
            }
          })
      }
      return next
    })
  }


  const getCleanNotesForList = (notes) => {
    const raw = (notes ?? '').toString().trim()
    if (!raw) return ''
    if (raw.includes('[Animal Bite Record]')) {
      const parts = raw.split('Additional Notes:\n')
      return parts[1]?.trim() || '🐾 Animal Bite Record details are stored.'
    }
    if (raw.includes('[TB Treatment Record]')) {
      const parts = raw.split('Additional Notes:\n')
      return parts[1]?.trim() || '🩺 Tuberculosis DS-TB details are stored.'
    }
    return raw
  }

  const workflowLabel = (status) => {
    const value = (status ?? 'completed').toString()
    if (value === 'awaiting_doctor') return 'Waiting for Doctor'
    if (value === 'doctor_in_progress') return 'In Progress'
    return 'Completed'
  }

  const workflowClasses = (status) => {
    const value = (status ?? 'completed').toString()
    if (value === 'awaiting_doctor') return 'bg-amber-50 text-amber-700'
    if (value === 'doctor_in_progress') return 'bg-blue-50 text-blue-700'
    return 'bg-emerald-50 text-emerald-700'
  }

  const DetailCard = ({ label, value }) => (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900 whitespace-pre-wrap wrap-break-word">{value}</p>
    </div>
  )

  const renderRecordDetails = (record) => {
    const isAnimalBite = (record.notes ?? '').includes('[Animal Bite Record]')
    const isTb = (record.notes ?? '').includes('[TB Treatment Record]')
    const formattedData = getFormDataForRecord(record)

    return (
      <div className="mt-3 space-y-4 max-h-[75vh] overflow-y-auto pr-2">
        {isAnimalBite ? (
          <AnimalBiteLegacyForm data={formattedData} readOnly={true} />
        ) : isTb ? (
          <TbLegacyForm data={formattedData} readOnly={true} />
        ) : (
          <OutpatientLegacyForm data={formattedData} readOnly={true} />
        )}
        {(record.diagnosis || record.prescription || record.notes) && (
          <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4 space-y-3">
            <p className="text-sm font-semibold text-teal-900">Consultation outcome</p>
            {record.diagnosis ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Diagnosis</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{record.diagnosis}</p>
              </div>
            ) : null}
            {record.prescription ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Prescription</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{record.prescription}</p>
              </div>
            ) : null}
            {record.notes && !isAnimalBite && !isTb ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{record.notes}</p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="module-card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="module-title">Patient Records</h2>
          <p className="module-subtitle">Centralized patient records and consultation notes in one place.</p>
        </div>
        <button
          onClick={() => navigate('/dashboard/encode-record')}
          className="px-8 py-2 text-xs font-medium rounded-lg bg-indigo-700 text-white hover:bg-indigo-600 shadow-sm"
          title="Encode historical paper records directly into the new workflow engine"
        >
          Encode Record
        </button>
      </div>

      <div className="mb-4">
        <label className="field-label" htmlFor="patient-search">
          Search
        </label>
        <input
          id="patient-search"
          type="text"
          className="field-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by patient name, queue reference, diagnosis, or notes"
        />
      </div>

      {showForm && (
        <ModalPortal>
          <div className="modal-overlay z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="flex h-[calc(100dvh-2rem)] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold text-slate-900">
                {isDoctor ? 'Diagnosis and Notes' : formMode === 'edit' ? 'Update Patient Record' : 'Add New Patient Record'}
              </h3>
              <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div ref={formScrollRef} className="min-h-0 flex-1 overflow-y-auto p-6">
                {isDoctor ? (
                  <div className="space-y-4">
                    {editingRecord ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        {renderRecordDetails(editingRecord)}
                        <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleGenerateSmartDiagnosis(editingRecord)}
                            disabled={generatingDiagnosis}
                            className="secondary-btn bg-indigo-50 text-indigo-700 hover:bg-indigo-100 flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                            {generatingDiagnosis ? 'Analyzing...' : 'AI Smart Suggest Diagnosis'}
                          </button>
                        </div>
                        {aiDiagnosis && (
                          <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                            <h4 className="text-sm font-bold text-indigo-900 mb-2 flex items-center gap-2">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                              AI Diagnostic Suggestion
                            </h4>
                            <div className="prose prose-sm max-w-none text-slate-700 prose-headings:text-indigo-900">
                              <ReactMarkdown>{aiDiagnosis}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}

                    <div>
                      <label className="field-label" htmlFor="diagnosis">
                        Diagnosis *
                      </label>
                      <textarea
                        id="diagnosis"
                        name="diagnosis"
                        className="field-input min-h-24"
                        value={formData.diagnosis}
                        onChange={handleInputChange}
                        placeholder="Enter diagnosis"
                        required
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="prescription">
                        Prescription
                      </label>
                      <textarea
                        id="prescription"
                        name="prescription"
                        className="field-input min-h-24"
                        value={formData.prescription}
                        onChange={handleInputChange}
                        placeholder="Medications, dose, frequency, duration (free text)"
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="notes">
                        Notes
                      </label>
                      <textarea
                        id="notes"
                        name="notes"
                        className="field-input min-h-24"
                        value={formData.notes}
                        onChange={handleInputChange}
                        placeholder="Enter notes"
                      />
                    </div>

                    {formError && <p className="error-banner">{formError}</p>}

                    <div className="pt-6 border-t border-slate-200 flex justify-end gap-3">
                      <button type="button" onClick={() => setShowForm(false)} className="secondary-btn">Cancel</button>
                      <button type="submit" className="primary-btn px-8" disabled={formLoading}>
                        {formLoading ? 'Saving...' : 'Save & Complete'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {formData.notes?.includes('[Animal Bite Record]') || formData.bite_place || formData.animal_type || formData.bite_type || formData.bite_site ? (
                      <AnimalBiteLegacyForm data={formData} onChange={setFormData} />
                    ) : formData.notes?.includes('[TB Treatment Record]') || formData.diagnosing_facility || formData.ntp_facility_code || formData.tb_case_number ? (
                      <TbLegacyForm data={formData} onChange={setFormData} />
                    ) : (
                      <OutpatientLegacyForm data={formData} onChange={setFormData} />
                    )}

                    {formError && <p className="error-banner">{formError}</p>}

                    <div className="pt-6 border-t border-slate-200 flex justify-end gap-3">
                      <button type="button" onClick={() => setShowForm(false)} className="secondary-btn">Cancel</button>
                      <button type="submit" className="primary-btn px-8" disabled={formLoading}>
                        {formLoading
                          ? 'Saving...'
                          : appointmentContext && isNurse
                            ? 'Send to Doctor'
                            : formMode === 'edit'
                              ? 'Update Record'
                              : 'Save Record'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </form>
          </div>
          </div>
        </ModalPortal>
      )}

      {loading && <p className="info-banner mb-4">Loading patient records...</p>}
      {error && <p className="error-banner mb-4">Patient records error: {error}</p>}

      {!loading && !hasAnyData ? (
        <ModuleEmptyState
          title="No patient records yet"
          description="Once patients and consultation findings are encoded, records will appear here."
        />
      ) : !loading && filteredPatientEntries.length === 0 ? (
        <ModuleEmptyState
          title="No matching patient records"
          description="Try a different search term (name, queue reference, diagnosis, or notes)."
        />
      ) : (
        <div className="space-y-3">
          {filteredPatientEntries.map((entry) => {
            const latestRecord = entry.records[0] ?? null
            return (
              <article
                key={entry.patientId ?? entry.key}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{entry.name || 'Unnamed patient'}</h3>
                    <p className="text-sm text-slate-600">
                      Queue reference: {entry.queue_id ? entry.queue_id : 'Not available'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {entry.records.length} record{entry.records.length === 1 ? '' : 's'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleGenerateSummary(entry)}
                      disabled={generatingSummaryId === (entry.patientId || entry.key)}
                      className="text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      {generatingSummaryId === (entry.patientId || entry.key) ? 'Summarizing...' : 'AI Summary'}
                    </button>
                  </div>
                </div>

                {aiSummaryMap[entry.patientId || entry.key] && (
                  <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 shadow-sm">
                    <h4 className="text-sm font-bold text-indigo-900 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      AI Patient History Summary
                    </h4>
                    <div className="prose prose-sm max-w-none text-slate-700 prose-headings:text-indigo-900">
                      <ReactMarkdown>{aiSummaryMap[entry.patientId || entry.key]}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {latestRecord && (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">Latest</p>
                        {latestRecord.appointment_id && latestRecord.workflow_status !== 'completed' ? (
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${workflowClasses(latestRecord.workflow_status)}`}
                          >
                            {workflowLabel(latestRecord.workflow_status)}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => toggleViewRecord(latestRecord.id)}
                        >
                          {expandedRecordId === latestRecord.id ? 'Hide' : 'View'}
                        </button>
                        {isDoctor ? (
                          (latestRecord.workflow_status ?? 'completed').toString() !== 'completed' ? (
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => {
                                void Promise.resolve()
                                  .then(() => acceptDoctorRecord(latestRecord))
                                  .then((ok) => {
                                    if (!ok) return
                                    handleEditRecord(latestRecord)
                                  })
                              }}
                            >
                              Diagnose
                            </button>
                          ) : null
                        ) : (
                          <button
                            type="button"
                            className="secondary-btn"
                            onClick={() => {
                              handleEditRecord(latestRecord)
                            }}
                          >
                            Update
                          </button>
                        )}
                        {!isDoctor ? (
                          <>
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => handleArchiveRecord(latestRecord)}
                              aria-label="Archive"
                              title="Archive"
                            >
                              <ArchiveIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className="secondary-btn hover:bg-rose-100 hover:text-rose-700"
                              onClick={() => handleArchivePatient(entry)}
                              aria-label="Archive patient"
                              title="Archive patient and all records"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                              </svg>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-sm text-slate-700">{latestRecord.diagnosis || 'No diagnosis provided'}</p>
                    {latestRecord.barangay ? (
                      <p className="mt-1 text-sm text-slate-600">
                        Location: {latestRecord.barangay}
                        {latestRecord.municipality ? `, ${latestRecord.municipality}` : ''}
                        {latestRecord.province ? `, ${latestRecord.province}` : ''}
                      </p>
                    ) : null}
                    {latestRecord.date_of_consultation ? (
                      <p className="mt-1 text-sm text-slate-600">Consultation: {latestRecord.date_of_consultation}</p>
                    ) : null}
                    {latestRecord.notes ? <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{getCleanNotesForList(latestRecord.notes)}</p> : null}

                    {expandedRecordId === latestRecord.id ? (
                      <ModalPortal>
                        <div className="modal-overlay z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center" role="dialog" aria-modal="true">
                        <div className="flex h-[calc(100dvh-2rem)] min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
                          <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h3 className="text-xl font-bold text-slate-900">Patient Record Details</h3>
                            <button onClick={() => toggleViewRecord(latestRecord.id)} className="text-slate-400 hover:text-slate-600 transition-colors">
                              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                          <div className="patient-record-details-scroll min-h-0 flex-1 overflow-y-auto p-6">
                            {renderRecordDetails(latestRecord)}
                          </div>
                        </div>
                        </div>
                      </ModalPortal>
                    ) : null}
                  </div>
                )}

                {entry.records.length > 1 ? (
                  <div className="mt-3 space-y-2">
                    {entry.records.slice(1, 4).map((record) => (
                      <div key={record.id} className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{record.diagnosis || 'No diagnosis provided'}</p>
                            {record.appointment_id && record.workflow_status !== 'completed' ? (
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${workflowClasses(record.workflow_status)}`}
                              >
                                {workflowLabel(record.workflow_status)}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="secondary-btn" onClick={() => toggleViewRecord(record.id)}>
                              {expandedRecordId === record.id ? 'Hide' : 'View'}
                            </button>
                            {isDoctor ? (
                              (record.workflow_status ?? 'completed').toString() !== 'completed' ? (
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={() => {
                                    void Promise.resolve()
                                      .then(() => acceptDoctorRecord(record))
                                      .then((ok) => {
                                        if (!ok) return
                                        handleEditRecord(record)
                                      })
                                  }}
                                >
                                  Diagnose
                                </button>
                              ) : null
                            ) : (
                              <>
                                <button type="button" className="secondary-btn" onClick={() => handleEditRecord(record)}>
                                  Update
                                </button>
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={() => handleArchiveRecord(record)}
                                  aria-label="Archive"
                                  title="Archive"
                                >
                                  <ArchiveIcon className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  className="secondary-btn hover:bg-rose-100 hover:text-rose-700"
                                  onClick={() => handleArchivePatient(entry)}
                                  aria-label="Archive patient"
                                  title="Archive patient and all records"
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                  </svg>
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {record.barangay ? (
                          <p className="mt-1 text-sm text-slate-600">
                            Location: {record.barangay}
                            {record.municipality ? `, ${record.municipality}` : ''}
                            {record.province ? `, ${record.province}` : ''}
                          </p>
                        ) : null}
                        {record.date_of_consultation ? (
                          <p className="mt-1 text-sm text-slate-600">Consultation: {record.date_of_consultation}</p>
                        ) : null}
                        {record.notes ? <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{getCleanNotesForList(record.notes)}</p> : null}

                        {expandedRecordId === record.id ? (
                          <ModalPortal>
                            <div className="modal-overlay z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center" role="dialog" aria-modal="true">
                            <div className="flex h-[calc(100dvh-2rem)] min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
                              <div className="p-6 border-b border-slate-200 flex justify-between items-center sticky top-0 bg-white z-10">
                                <h3 className="text-xl font-bold text-slate-900">Patient Record Details</h3>
                                <button onClick={() => toggleViewRecord(record.id)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                              <div className="patient-record-details-scroll min-h-0 flex-1 overflow-y-auto p-6">
                                {renderRecordDetails(record)}
                              </div>
                            </div>
                            </div>
                          </ModalPortal>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            )
          })}
          {(hasMoreRecords || hasMorePatients) && (
            <div className="pt-2">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading more…' : 'Load more records'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
