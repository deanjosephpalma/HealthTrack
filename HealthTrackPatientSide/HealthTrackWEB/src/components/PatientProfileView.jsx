function formatValue(value) {
  const text = (value ?? '').toString().trim()
  return text || '—'
}

function formatBirthdate(value) {
  const raw = (value ?? '').toString().trim()
  if (!raw) return '—'
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return formatValue(raw)
  const dd = String(parsed.getDate()).padStart(2, '0')
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const yyyy = parsed.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function computeAge(birthdateValue) {
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

function Field({ label, value, required = false }) {
  return (
    <div>
      <p className="text-xs text-slate-500">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900 break-words">{formatValue(value)}</p>
    </div>
  )
}

/**
 * Read-only master patient profile (matches patient portal Profile layout).
 */
export default function PatientProfileView({ patient, email }) {
  if (!patient) {
    return <p className="text-sm text-slate-600">Patient profile not found.</p>
  }

  const age = patient.age ?? computeAge(patient.birthdate)

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">
          Personal Information
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="First Name" value={patient.first_name} required />
          <Field label="Middle Name" value={patient.middle_name} />
          <Field label="Last Name" value={patient.last_name} required />
          <Field label="Birthdate" value={formatBirthdate(patient.birthdate)} required />
          <Field label="Age" value={age != null ? String(age) : null} />
          <Field label="Sex" value={patient.sex} required />
          <Field label="Civil Status" value={patient.civil_status} required />
          <Field label="Blood Type" value={patient.blood_type} />
          <Field label="Religion" value={patient.religion} />
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Mother's Maiden Name" value={patient.mother_maiden_name} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">
          Contact & Address
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Mobile Phone" value={patient.mobile_phone || patient.phone} required />
          <Field label="Email Address" value={email || patient.email} />
          <div className="hidden lg:block" />
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="House No. / Street / Purok" value={patient.house_no_purok} required />
          </div>
          <Field label="Barangay" value={patient.barangay} required />
          <Field label="Municipality" value={patient.municipality || 'Pila'} />
          <Field label="Province" value={patient.province || 'Laguna'} />
        </div>
      </div>

      <div>
        <h3 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">
          Other Details
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="PhilHealth Number" value={patient.philhealth_number} />
          <Field label="Education" value={patient.education} />
          <Field label="Occupation" value={patient.occupation} />
          <Field label="Disability" value={patient.disability} />
        </div>
      </div>
    </div>
  )
}
