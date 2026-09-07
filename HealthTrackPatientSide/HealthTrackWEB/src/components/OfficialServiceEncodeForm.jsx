/**
 * BHW / Volunteer encode layouts that mirror official RHU certificate / permit forms.
 * Field names align with citizenCharter intake + issuedDocumentPdf details.
 */

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:opacity-70'

function Field({ label, name, type = 'text', data, onChange, required, placeholder, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <input
        className={inputClass}
        name={name}
        type={type}
        value={data[name] ?? ''}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
      />
    </label>
  )
}

function Select({ label, name, options, data, onChange, required, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <select className={inputClass} name={name} value={data[name] ?? ''} onChange={onChange} required={required}>
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  )
}

function Area({ label, name, data, onChange, required, placeholder, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      <textarea
        className={inputClass}
        name={name}
        rows={3}
        value={data[name] ?? ''}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
      />
    </label>
  )
}

function PaperShell({ eyebrow, title, formNo, badge, children }) {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-slate-800 bg-[#fffcf7] shadow-lg">
      <div className="border-b border-slate-300 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-left">
              Republic of the Philippines · Province of Laguna · Municipality of Pila
            </p>
            <p className="mt-1 text-sm font-bold text-slate-800">{eyebrow}</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{title}</h3>
          </div>
          <div className="text-right">
            {formNo ? <p className="text-xs font-semibold text-slate-600">{formNo}</p> : null}
            {badge ? (
              <p className="mt-1 inline-flex rounded-md bg-rose-100 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-rose-800 ring-1 ring-rose-200">
                {badge}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="space-y-5 p-4 sm:p-6">{children}</div>
    </div>
  )
}

function PatientStrip({ data, onChange }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Patient / Applicant (portal profile)</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="First name" name="first_name" data={data} onChange={onChange} />
        <Field label="Middle name" name="middle_name" data={data} onChange={onChange} />
        <Field label="Last name" name="last_name" data={data} onChange={onChange} />
        <Field label="Mobile phone" name="mobile_phone" type="tel" data={data} onChange={onChange} />
        <Field label="Birthdate" name="birthdate" type="date" data={data} onChange={onChange} />
        <Select label="Sex" name="sex" options={['Male', 'Female']} data={data} onChange={onChange} />
        <Field label="Barangay" name="barangay" data={data} onChange={onChange} />
        <Field label="Occupation" name="occupation" data={data} onChange={onChange} />
      </div>
    </div>
  )
}

function HealthCertificateEncode({ data, onChange }) {
  const handler = (data.handler_type || '').toString().toLowerCase()
  const isNonFood = /non[-\s]?food/.test(handler)
  const badge = !handler ? null : isNonFood ? 'NON-FOOD' : 'FOODS'

  return (
    <PaperShell
      eyebrow="Office of the Municipal Health Officer, Pila, Laguna"
      title="HEALTH CERTIFICATE"
      formNo="EHS FORM NO. 102-A"
      badge={badge}
    >
      <p className="text-sm leading-relaxed text-slate-600">
        Pursuant to the provision of P.D. 522, P.D. 856 and City/Mun. Ord. No. ______, s. ______, this Certificate is
        issued for food or non-food establishment workers.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label="Handler type (Food / Non-Food)"
          name="handler_type"
          options={['Food handler', 'Non-food handler']}
          data={data}
          onChange={onChange}
          required
          className="sm:col-span-2"
        />
        <Field label="NAME (as on certificate)" name="applicant_name" data={data} onChange={onChange} required className="sm:col-span-2" />
        <Field label="OCCUPATION" name="position_or_work" data={data} onChange={onChange} required />
        <Field label="AGE" name="applicant_age" type="number" data={data} onChange={onChange} required />
        <Select label="SEX" name="applicant_sex" options={['Male', 'Female']} data={data} onChange={onChange} required />
        <Field label="NATIONALITY" name="nationality" data={data} onChange={onChange} placeholder="Filipino" />
        <Field label="PLACE OF WORK — Establishment" name="establishment_name" data={data} onChange={onChange} required />
        <Field label="Place of work — Address" name="establishment_address" data={data} onChange={onChange} required className="sm:col-span-2" />
        <Field label="Registration No. (if known)" name="registration_number" data={data} onChange={onChange} />
        <Field label="Contact number" name="applicant_contact" type="tel" data={data} onChange={onChange} required />
        <Select label="Laboratory request ready?" name="has_lab_request" options={['Yes', 'No']} data={data} onChange={onChange} />
        <Select
          label="Laboratory result ready?"
          name="has_lab_result"
          options={['Yes', 'No', 'Not applicable']}
          data={data}
          onChange={onChange}
        />
        <Select
          label="Medical certificate ready? (non-food)"
          name="has_medical_certificate"
          options={['Yes', 'No', 'Not applicable']}
          data={data}
          onChange={onChange}
        />
        <Area label="Additional notes" name="additional_notes" data={data} onChange={onChange} className="sm:col-span-2" />
      </div>
    </PaperShell>
  )
}

function SanitaryPermitEncode({ data, onChange }) {
  return (
    <PaperShell eyebrow="RURAL HEALTH UNIT · Municipality of Pila" title="SANITARY PERMIT" formNo="Municipal Sanitation Committee">
      <p className="text-sm leading-relaxed text-slate-600">
        In accordance with Presidential Decree No. 522 and 856. Subject to revocation if rules are not observed.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name of Establishment" name="establishment_name" data={data} onChange={onChange} required className="sm:col-span-2" />
        <Select
          label="Nature of Business / Type"
          name="establishment_type"
          options={[
            'Food establishment',
            'Non-food establishment',
            'School',
            'Boarding house / lodging',
            'Industrial / manufacturing',
            'Other',
          ]}
          data={data}
          onChange={onChange}
          required
        />
        <Field label="Nature of business (detail)" name="nature_of_business" data={data} onChange={onChange} placeholder="e.g. Carinderia, Sari-sari" />
        <Field label="Address" name="establishment_address" data={data} onChange={onChange} required className="sm:col-span-2" />
        <Field label="Owner / Operator" name="owner_name" data={data} onChange={onChange} required />
        <Field label="Owner contact" name="owner_contact" type="tel" data={data} onChange={onChange} required />
        <Field label="No. of employees / workers" name="number_of_employees" type="number" data={data} onChange={onChange} />
        <Select label="Application type" name="application_type" options={['New', 'Renewal']} data={data} onChange={onChange} required />
        <Field label="Permit No. (if renewal / known)" name="permit_number" data={data} onChange={onChange} />
        <Field label="Date of Issuance" name="date_of_issuance" type="date" data={data} onChange={onChange} />
        <Field label="Date of Expiration" name="date_of_expiration" type="date" data={data} onChange={onChange} />
        <Select label="Health certificate(s) of workers ready?" name="has_health_certificate" options={['Yes', 'No']} data={data} onChange={onChange} />
        <Select
          label="Business permit application ready?"
          name="has_business_permit_application"
          options={['Yes', 'No']}
          data={data}
          onChange={onChange}
        />
        <Area label="Additional notes" name="additional_notes" data={data} onChange={onChange} className="sm:col-span-2" />
      </div>
      <p className="text-center text-xs font-bold uppercase tracking-wide text-orange-700">This must be displayed in public view</p>
    </PaperShell>
  )
}

function ExhumationCremationTransferEncode({ data, onChange }) {
  const type = (data.permit_type || '').toString()
  const isExhumation = /^exhumation$/i.test(type)
  const isCremation = /^cremation$/i.test(type)
  const isTransfer = /^transfer$/i.test(type)

  const title = isCremation
    ? 'CREMATION PERMIT'
    : isTransfer
      ? 'CERTIFICATE OF TRANSFER OF CADAVER/BONES AND ASHES'
      : isExhumation
        ? 'CERTIFICATE OF EXHUMATION'
        : 'EXHUMATION / CREMATION / TRANSFER PERMIT'

  return (
    <PaperShell eyebrow="OFFICE OF THE MUNICIPAL HEALTH OFFICER" title={title}>
      <Select
        label="Permit type"
        name="permit_type"
        options={['Exhumation', 'Cremation', 'Transfer']}
        data={data}
        onChange={onChange}
        required
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name of deceased" name="deceased_name" data={data} onChange={onChange} required className="sm:col-span-2" />
        <Field label="Date of death" name="date_of_death" type="date" data={data} onChange={onChange} required />
        <Field label="Place of death" name="place_of_death" data={data} onChange={onChange} required />
        <Field
          label="Cause of death"
          name="cause_of_death"
          data={data}
          onChange={onChange}
          required={isExhumation || isTransfer || isCremation}
          placeholder="As stated on death certificate"
          className="sm:col-span-2"
        />
        {(isTransfer || !type) && (
          <Field label="Age of deceased" name="deceased_age" type="number" data={data} onChange={onChange} />
        )}
        <Field
          label={isCremation ? 'Crematory / place of disposition' : 'Cemetery / destination'}
          name="cemetery_or_destination"
          data={data}
          onChange={onChange}
          required
          className="sm:col-span-2"
        />
        <Field label="Requester full name" name="requester_name" data={data} onChange={onChange} required />
        <Field label="Relationship to deceased" name="requester_relationship" data={data} onChange={onChange} required />
        <Field label="Requester contact" name="requester_contact" type="tel" data={data} onChange={onChange} required />
        <Field label="Requester address" name="requester_address" data={data} onChange={onChange} required />
        <Field label="O.R. No." name="or_number" data={data} onChange={onChange} />
        <Field label="O.R. / application date" name="or_date" type="date" data={data} onChange={onChange} />
        <Select
          label="Death certificate attached / ready?"
          name="documents_ready"
          options={['Yes', 'No']}
          data={data}
          onChange={onChange}
          required
        />
        <Area label="Additional details" name="additional_notes" data={data} onChange={onChange} className="sm:col-span-2" />
      </div>

      {isTransfer ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
          Transfer note: Cause of death should be non-communicable. Not valid unless corresponding fee is paid.
        </p>
      ) : null}
    </PaperShell>
  )
}

function DeathCertificateReviewEncode({ data, onChange }) {
  return (
    <PaperShell
      eyebrow="OFFICE OF THE CIVIL REGISTRAR GENERAL · Working copy for RHU review"
      title="CERTIFICATE OF DEATH"
      formNo="Municipal Form No. 103 (Revised August 2016)"
    >
      <p className="text-sm text-slate-600">
        Encode the entries under review. Nurse / MHO will use this for evaluation and release of related permits.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="1. NAME of deceased" name="deceased_name" data={data} onChange={onChange} required className="sm:col-span-2 lg:col-span-3" />
        <Select label="2. SEX" name="deceased_sex" options={['Male', 'Female']} data={data} onChange={onChange} />
        <Field label="3. DATE OF DEATH" name="date_of_death" type="date" data={data} onChange={onChange} required />
        <Field label="4. DATE OF BIRTH" name="date_of_birth" type="date" data={data} onChange={onChange} />
        <Field label="5. Age at death" name="deceased_age" data={data} onChange={onChange} placeholder="Years / months / days" />
        <Field label="6. PLACE OF DEATH" name="place_of_death" data={data} onChange={onChange} required className="sm:col-span-2" />
        <Select
          label="7. CIVIL STATUS"
          name="deceased_civil_status"
          options={['Single', 'Married', 'Widow', 'Widower', 'Annulled', 'Divorced']}
          data={data}
          onChange={onChange}
        />
        <Field label="8. Religion" name="deceased_religion" data={data} onChange={onChange} />
        <Field label="9. Citizenship" name="deceased_citizenship" data={data} onChange={onChange} placeholder="Filipino" />
        <Field label="10. Residence" name="deceased_residence" data={data} onChange={onChange} className="sm:col-span-2 lg:col-span-3" />
        <Field label="11. Occupation" name="deceased_occupation" data={data} onChange={onChange} />
        <Field label="12. Name of father" name="father_name" data={data} onChange={onChange} />
        <Field label="13. Maiden name of mother" name="mother_maiden_name_deceased" data={data} onChange={onChange} />
        <Area
          label="19b. Causes of death (immediate / antecedent / underlying)"
          name="cause_of_death"
          data={data}
          onChange={onChange}
          required
          className="sm:col-span-2 lg:col-span-3"
        />
        <Select
          label="23. Corpse disposal"
          name="corpse_disposal"
          options={['Burial', 'Cremation', 'Others']}
          data={data}
          onChange={onChange}
        />
        <Field label="24a. Burial / Cremation Permit No." name="burial_cremation_permit_no" data={data} onChange={onChange} />
        <Field label="24b. Transfer Permit No." name="transfer_permit_no" data={data} onChange={onChange} />
        <Field label="25. Cemetery / Crematory" name="cemetery_or_destination" data={data} onChange={onChange} className="sm:col-span-2" />
        <Field label="Requester full name" name="requester_name" data={data} onChange={onChange} required />
        <Field label="Relationship to deceased" name="requester_relationship" data={data} onChange={onChange} required />
        <Field label="Requester contact" name="requester_contact" type="tel" data={data} onChange={onChange} required />
        <Select
          label="Reason for review"
          name="review_reason"
          options={['Correction of entries', 'Authentication / verification', 'Claim / insurance', 'Other']}
          data={data}
          onChange={onChange}
          required
        />
        <Area label="Details / purpose of review" name="purpose" data={data} onChange={onChange} required className="sm:col-span-2 lg:col-span-3" />
        <Select label="Death certificate on hand?" name="has_death_certificate" options={['Yes', 'No']} data={data} onChange={onChange} required />
        <Field label="Registry No. (if any)" name="registry_number" data={data} onChange={onChange} />
      </div>
    </PaperShell>
  )
}

const OFFICIAL_ENCODE_KEYS = new Set([
  'health_card_issuance',
  'sanitary_permit_issuance',
  'exhumation_cremation_transfer_permit',
  'review_death_certificate',
])

export function isOfficialEncodeService(charterKey) {
  return OFFICIAL_ENCODE_KEYS.has(charterKey)
}

export default function OfficialServiceEncodeForm({ charterKey, data = {}, onChange = () => {} }) {
  const handleChange = (e) => {
    const { name, value } = e.target
    const next = { ...data, [name]: value }

    // Prefill certificate name from portal profile when empty
    if (
      charterKey === 'health_card_issuance' &&
      ['first_name', 'middle_name', 'last_name'].includes(name) &&
      !(data.applicant_name || '').toString().trim()
    ) {
      const composed = [next.first_name, next.middle_name, next.last_name].filter(Boolean).join(' ').trim()
      if (composed) next.applicant_name = composed
    }
    if (name === 'birthdate' && charterKey === 'health_card_issuance') {
      const birth = new Date(value)
      if (!Number.isNaN(birth.getTime())) {
        const today = new Date()
        let age = today.getFullYear() - birth.getFullYear()
        const m = today.getMonth() - birth.getMonth()
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1
        if (age >= 0) next.applicant_age = String(age)
      }
    }
    if (name === 'sex' && charterKey === 'health_card_issuance' && !(data.applicant_sex || '').toString().trim()) {
      next.applicant_sex = value
    }
    if (name === 'occupation' && charterKey === 'health_card_issuance' && !(data.position_or_work || '').toString().trim()) {
      next.position_or_work = value
    }

    onChange(next)
  }

  let body = null
  if (charterKey === 'health_card_issuance') body = <HealthCertificateEncode data={data} onChange={handleChange} />
  else if (charterKey === 'sanitary_permit_issuance') body = <SanitaryPermitEncode data={data} onChange={handleChange} />
  else if (charterKey === 'exhumation_cremation_transfer_permit')
    body = <ExhumationCremationTransferEncode data={data} onChange={handleChange} />
  else if (charterKey === 'review_death_certificate')
    body = <DeathCertificateReviewEncode data={data} onChange={handleChange} />
  else {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No official encode form for this service.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PatientStrip data={data} onChange={handleChange} />
      {body}
    </div>
  )
}
