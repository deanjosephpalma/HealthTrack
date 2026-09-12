import { useEffect, useMemo, useState } from 'react'
import ModuleEmptyState from '../../components/ModuleEmptyState'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/useAuth'
import { supabase } from '../../lib/supabaseClient'
import { fetchIssuedDocsForPatient } from '../../lib/issueDocuments'
import {
  documentTitleFromRow,
  downloadIssuedDocumentPdf,
  pdfPayloadFromCertificate,
  pdfPayloadFromPermit,
} from '../../lib/issuedDocumentPdf'

const computeAgeFromBirthdate = (birthdateValue) => {
  const raw = (birthdateValue ?? '').toString().trim()
  if (!raw) return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - parsed.getFullYear()
  const monthDiff = today.getMonth() - parsed.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < parsed.getDate())) {
    age -= 1
  }
  return age >= 0 ? age : null
}

const formatValue = (value) => {
  const text = (value ?? '').toString().trim()
  return text ? text : '—'
}

const formatBool = (value) => (value ? 'Yes' : 'No')

function DetailCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900 whitespace-pre-wrap break-words">{value}</p>
    </div>
  )
}

export default function PatientMedicalRecordsPage() {
  const { user, patient } = useAuth()
  const [records, setRecords] = useState([])
  const [issuedDocs, setIssuedDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState(null)

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      if (!user) return
      setLoading(true)
      setError('')

      const { data: patientRow } = await supabase
        .from('patients')
        .select('id')
        .eq('patient_auth_id', user.id)
        .maybeSingle()

      if (!isMounted) return

      let query = supabase
        .from('patient_records')
        .select('*')
        .eq('workflow_status', 'completed')
        .is('archived_at', null)
        .order('date_of_consultation', { ascending: false })

      if (patientRow?.id) {
        query = query.or(`patient_auth_id.eq.${user.id},patient_id.eq.${patientRow.id}`)
      } else {
        query = query.eq('patient_auth_id', user.id)
      }

      const { data, error: loadError } = await query

      let docs = []
      if (patientRow?.id || user.id) {
        const issued = await fetchIssuedDocsForPatient(patientRow?.id ?? null, {
          patientAuthId: user.id,
          backfill: true,
        })
        // Don't block the page on missing tables — still show synthetic docs
        if (issued.error && !issued.synthetic && !(issued.certificates?.length || issued.permits?.length) && isMounted) {
          // soft warning only when nothing usable came back
          console.warn('Issued documents load:', issued.error)
        }
        const certs = (issued.certificates ?? []).map((row) => ({
          kind: 'certificate',
          row,
          sortAt: row.released_at || row.issued_at || row.created_at,
        }))
        const permits = (issued.permits ?? []).map((row) => ({
          kind: 'permit',
          row,
          sortAt: row.released_at || row.approved_at || row.created_at,
        }))
        docs = [...certs, ...permits].sort((a, b) => String(b.sortAt || '').localeCompare(String(a.sortAt || '')))
      }

      if (!isMounted) return

      if (loadError) {
        setError(loadError.message)
        setRecords([])
        setIssuedDocs(docs)
        setLoading(false)
        return
      }

      setRecords(data ?? [])
      setIssuedDocs(docs)
      setLoading(false)
    }
    load()
    return () => {
      isMounted = false
    }
  }, [user])

  const latest = records[0] ?? null
  const summary = useMemo(() => {
    const age = latest?.birthdate ? computeAgeFromBirthdate(latest.birthdate) : null
    return {
      fullName: patient?.name || latest?.patient_name || 'Patient',
      age: age ?? latest?.age ?? null,
      gender: latest?.sex ?? null,
      bloodType: latest?.blood_type ?? null,
      contact: latest?.mobile_phone ?? patient?.phone ?? null,
    }
  }, [latest, patient])

  const handleViewRecord = (record) => {
    setSelectedRecord(record)
    setShowModal(true)
  }

  const formatDate = (value) => {
    const raw = (value ?? '').toString().trim()
    if (!raw) return '—'
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return formatValue(raw)
    return parsed.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const downloadDoc = async (item) => {
    const name = patient?.name || summary.fullName || 'Patient'
    let row = item.row
    const existingDetails = row?.details && typeof row.details === 'object' ? row.details : {}
    if (
      item.kind === 'certificate' &&
      Object.keys(existingDetails).length === 0 &&
      row?.service_request_id
    ) {
      const { data: sr } = await supabase
        .from('service_requests')
        .select('intake_data')
        .eq('id', row.service_request_id)
        .maybeSingle()
      if (sr?.intake_data && typeof sr.intake_data === 'object') {
        row = { ...row, details: sr.intake_data }
      }
    }
    const payload =
      item.kind === 'permit'
        ? pdfPayloadFromPermit(row, name)
        : pdfPayloadFromCertificate(row, name)
    downloadIssuedDocumentPdf({
      ...payload,
      patientDetails: {
        age: summary.age,
        sex: summary.gender,
        birthdate: latest?.birthdate || patient?.birthdate,
        barangay: latest?.barangay || patient?.barangay,
        house_no_purok: latest?.house_no_purok,
        municipality: latest?.municipality || 'Pila',
        province: latest?.province || 'Laguna',
      },
    })
  }

  const renderDetails = (record) => {
    const medcertText = [
      record.medcert_pwd ? 'PWD' : '',
      record.medcert_work ? 'WORK' : '',
      record.medcert_financial ? 'FINANCIAL' : '',
      record.medcert_4ps ? '4PS' : '',
      record.medcert_school ? 'SCHOOL' : '',
    ]
      .filter(Boolean)
      .join(', ')

    const femaleVisible =
      (record.sex ?? '').toString().toLowerCase() === 'female' ||
      record.female_age_first_menses != null ||
      record.lmp ||
      record.gravida != null ||
      record.para != null ||
      record.cs_date ||
      record.nsd_date ||
      record.female_age_first_pregnancy != null ||
      record.menopausal_age != null

    return (
      <div className="mt-4 space-y-5">
        <section className="rounded-2xl border border-teal-200 bg-teal-50/50 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-800">
            Doctor&apos;s consultation
          </p>
          <p className="mt-1 text-sm text-teal-900/80">
            Date: {formatDate(record.date_of_consultation || record.created_at)}
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">Diagnosis</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-base font-semibold text-slate-900">
                {formatValue(record.diagnosis)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">Prescription</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">
                {formatValue(record.prescription)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">Notes</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">
                {formatValue(record.notes)}
              </p>
            </div>
          </div>
        </section>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">Patient Information</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailCard label="Patient Name" value={formatValue(record.patient_name)} />
            <DetailCard label="First Name" value={formatValue(record.first_name)} />
            <DetailCard label="Middle Name" value={formatValue(record.middle_name)} />
            <DetailCard label="Last Name" value={formatValue(record.last_name)} />
            <DetailCard label="Age" value={formatValue(record.age)} />
            <DetailCard label="Sex" value={formatValue(record.sex)} />
            <DetailCard label="Birthdate" value={formatValue(record.birthdate)} />
            <DetailCard label="Civil Status" value={formatValue(record.civil_status)} />
            <DetailCard label="Religion" value={formatValue(record.religion)} />
            <DetailCard label="Blood Type" value={formatValue(record.blood_type)} />
            <DetailCard label="Mobile Phone" value={formatValue(record.mobile_phone)} />
            <DetailCard label="Education" value={formatValue(record.education)} />
            <DetailCard label="Occupation" value={formatValue(record.occupation)} />
            <DetailCard label="Disability" value={formatValue(record.disability)} />
            <DetailCard label="Mother Maiden Name" value={formatValue(record.mother_maiden_name)} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">Address</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailCard label="House No / Purok" value={formatValue(record.house_no_purok)} />
            <DetailCard label="Barangay" value={formatValue(record.barangay)} />
            <DetailCard label="Municipality" value={formatValue(record.municipality)} />
            <DetailCard label="Province" value={formatValue(record.province)} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">Membership</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailCard label="PhilHealth No." value={formatValue(record.philhealth_number)} />
            <DetailCard label="Member Name" value={formatValue(record.member_name)} />
            <DetailCard label="Member Birthdate" value={formatValue(record.member_birthdate)} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">Vital Signs</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailCard label="WT" value={formatValue(record.wt)} />
            <DetailCard label="HT" value={formatValue(record.ht)} />
            <DetailCard label="TEMP" value={formatValue(record.temp)} />
            <DetailCard label="BP" value={formatValue(record.bp)} />
            <DetailCard label="SpO2" value={formatValue(record.spo2)} />
            <DetailCard label="PR/HR" value={formatValue(record.pr_hr)} />
            <DetailCard label="RR" value={formatValue(record.rr)} />
            <DetailCard label="Waist" value={formatValue(record.waist)} />
            <DetailCard label="Hip" value={formatValue(record.hip)} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">Medical Certificate</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailCard label="Medcert (Selected)" value={formatValue(medcertText)} />
            <DetailCard label="Medcert (Others)" value={formatValue(record.medcert_others)} />
            <DetailCard label="PWD" value={formatBool(Boolean(record.medcert_pwd))} />
            <DetailCard label="Work" value={formatBool(Boolean(record.medcert_work))} />
            <DetailCard label="Financial" value={formatBool(Boolean(record.medcert_financial))} />
            <DetailCard label="4PS" value={formatBool(Boolean(record.medcert_4ps))} />
            <DetailCard label="School" value={formatBool(Boolean(record.medcert_school))} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">Operations</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailCard label="Operation Name" value={formatValue(record.operation_name)} />
            <DetailCard label="Operation Date" value={formatValue(record.operation_date)} />
          </div>
        </div>

        {femaleVisible ? (
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-900">For Female Patient</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <DetailCard label="Age at First Menses" value={formatValue(record.female_age_first_menses)} />
              <DetailCard label="LMP" value={formatValue(record.lmp)} />
              <DetailCard label="Gravida" value={formatValue(record.gravida)} />
              <DetailCard label="Para" value={formatValue(record.para)} />
              <DetailCard label="CS Date" value={formatValue(record.cs_date)} />
              <DetailCard label="NSD Date" value={formatValue(record.nsd_date)} />
              <DetailCard label="Age at First Pregnancy" value={formatValue(record.female_age_first_pregnancy)} />
              <DetailCard label="Menopausal Age" value={formatValue(record.menopausal_age)} />
            </div>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">Vaccination</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <DetailCard label="COVID Vaccine Brand" value={formatValue(record.covid_vaccine_brand)} />
            <DetailCard label="COVID Vaccine Date" value={formatValue(record.covid_vaccine_date)} />
            <DetailCard label="Other Vaccines" value={formatValue(record.other_vaccines)} />
            <DetailCard label="Flu Vaccine Date" value={formatValue(record.flu_vaccine_date)} />
            <DetailCard label="Pneumo Vaccine Date" value={formatValue(record.pneumo_vaccine_date)} />
            <DetailCard label="TD Vaccine Date" value={formatValue(record.td_vaccine_date)} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="space-y-6">
      <section className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5">
        <p className="patient-panel-eyebrow">Patient summary</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <DetailCard label="Full Name" value={formatValue(summary.fullName)} />
          <DetailCard label="Age" value={summary.age != null ? String(summary.age) : '—'} />
          <DetailCard label="Gender" value={formatValue(summary.gender)} />
          <DetailCard label="Blood Type" value={formatValue(summary.bloodType)} />
          <DetailCard label="Contact Number" value={formatValue(summary.contact)} />
        </div>
      </section>

      {loading && <p className="info-banner">Loading medical records...</p>}
      {error && <p className="error-banner">Medical records error: {error}</p>}

      {!loading ? (
        <section id="permits-certificates" className="space-y-3">
          <div>
            <h3 className="patient-panel-title">Permits &amp; Certificates</h3>
            <p className="mt-1 text-sm text-slate-600">
              Download issued health cards, permits, and medical certificates as PDF.
            </p>
          </div>
          {issuedDocs.length === 0 ? (
            <ModuleEmptyState
              title="No permits or certificates yet"
              description="When staff releases your health card, permit, or medical certificate, it will appear here for PDF download."
            />
          ) : (
            <div className="space-y-3">
              {issuedDocs.map((item) => (
                <article key={`${item.kind}-${item.row.id}`} className="doc-card">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">
                          {formatDate(item.sortAt)}
                        </p>
                        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                          Released
                        </span>
                      </div>
                      <h4 className="text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                        {documentTitleFromRow(item.row)}
                      </h4>
                      <p className="text-sm leading-relaxed text-slate-600">
                        {item.kind === 'certificate'
                          ? formatValue(item.row.purpose)
                          : formatValue(item.row.details?.outcome || item.row.permit_type)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
                      onClick={() => downloadDoc(item)}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"
                        />
                      </svg>
                      Download PDF
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-3">
          <h3 className="patient-panel-title">Consultation history</h3>
          {records.length === 0 ? (
            <ModuleEmptyState
              title="No medical records yet"
              description="Records appear here after a doctor or nurse completes your visit with diagnosis and notes."
            />
          ) : (
            records.map((record) => (
              <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {formatDate(record.date_of_consultation || record.created_at)}
                    </p>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-teal-700">Diagnosis</p>
                      <h3 className="mt-0.5 text-lg font-semibold text-slate-900 whitespace-pre-wrap break-words">
                        {formatValue(record.diagnosis)}
                      </h3>
                    </div>
                    {record.prescription ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Prescription</p>
                        <p className="mt-0.5 text-sm text-slate-700 whitespace-pre-wrap break-words">
                          {formatValue(record.prescription)}
                        </p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Notes</p>
                      <p className="mt-0.5 text-sm text-slate-700 whitespace-pre-wrap break-words">
                        {formatValue(record.notes)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="secondary-btn !mt-0 shrink-0"
                    onClick={() => handleViewRecord(record)}
                  >
                    View full record
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {showModal && selectedRecord && typeof document !== 'undefined' ? createPortal(
        <div className="modal-overlay z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="patient-medical-record-title">
          <div className="flex h-[calc(100dvh-2rem)] min-h-0 w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6 sm:py-5">
              <div className="min-w-0">
                <h2 id="patient-medical-record-title" className="text-xl font-bold text-slate-900">Patient Record Details</h2>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" aria-label="Close medical record">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">{renderDetails(selectedRecord)}</div>
          </div>
        </div>,
        document.body,
      ) : null}
    </section>
  )
}
