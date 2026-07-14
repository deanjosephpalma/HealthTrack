import { resolveCharterKeyFromServiceName } from '../lib/resolveCharterService'
import { getCharterByCode } from '../config/citizenCharter'

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-slate-800 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] transition-all focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-75'

function FormField({ label, name, type = 'text', required, data, onChange, disabled, placeholder = '' }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="ml-1 text-[11px] font-bold uppercase tracking-wider text-slate-500" htmlFor={name}>
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </label>
      <input
        id={name}
        type={type}
        name={name}
        value={data[name] ?? ''}
        onChange={onChange}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  )
}

function SelectField({ label, name, options = [], required, data, onChange, disabled }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="ml-1 text-[11px] font-bold uppercase tracking-wider text-slate-500" htmlFor={name}>
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </label>
      <select
        id={name}
        name={name}
        value={data[name] ?? ''}
        onChange={onChange}
        required={required}
        disabled={disabled}
        className={inputClass}
      >
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}

function TextAreaField({ label, name, required, data, onChange, disabled, placeholder = '' }) {
  return (
    <div className="flex flex-col gap-1.5 md:col-span-2">
      <label className="ml-1 text-[11px] font-bold uppercase tracking-wider text-slate-500" htmlFor={name}>
        {label} {required ? <span className="text-rose-500">*</span> : null}
      </label>
      <textarea
        id={name}
        name={name}
        rows={3}
        value={data[name] ?? ''}
        onChange={onChange}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  )
}

function CheckboxGroup({ label, name, options, data, onChange, disabled }) {
  const selected = Array.isArray(data[name]) ? data[name] : []
  const toggle = (opt) => {
    if (disabled) return
    const next = selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt]
    onChange({ ...data, [name]: next })
  }
  return (
    <div className="md:col-span-2">
      <p className="mb-2 ml-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((opt) => {
          const checked = selected.includes(opt)
          return (
            <label
              key={opt}
              className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-semibold ${
                checked ? 'border-teal-300 bg-teal-50 text-teal-900' : 'border-slate-200 bg-slate-50 text-slate-700'
              } ${disabled ? 'cursor-not-allowed opacity-75' : ''}`}
            >
              <input
                type="checkbox"
                className="rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(opt)}
              />
              {opt}
            </label>
          )
        })}
      </div>
    </div>
  )
}

const THEME = {
  animal_bite_anti_rabies: {
    accent: 'from-amber-500 via-orange-600 to-rose-600',
    eyebrow: 'Animal Bite / Anti-rabies',
  },
  exhumation_cremation_transfer_permit: {
    accent: 'from-slate-700 via-slate-800 to-teal-900',
    eyebrow: 'Burial / Cremation / Transfer',
  },
  review_death_certificate: {
    accent: 'from-slate-600 via-slate-700 to-indigo-900',
    eyebrow: 'Death Certificate Review',
  },
  health_card_issuance: {
    accent: 'from-teal-600 via-emerald-600 to-cyan-700',
    eyebrow: 'Health Card Issuance',
  },
  medical_certificate_issuance: {
    accent: 'from-teal-700 via-teal-800 to-slate-900',
    eyebrow: 'Medical Certificate',
  },
  sanitary_permit_issuance: {
    accent: 'from-sky-600 via-blue-700 to-indigo-800',
    eyebrow: 'Sanitary Permit',
  },
  tuberculosis_treatment_services: {
    accent: 'from-rose-600 via-rose-700 to-slate-900',
    eyebrow: 'TB Treatment',
  },
  pre_marriage_counseling: {
    accent: 'from-rose-400 via-pink-500 to-fuchsia-700',
    eyebrow: 'Pre-marriage Counseling',
  },
  outpatient_consultation: {
    accent: 'from-teal-600 via-teal-700 to-slate-800',
    eyebrow: 'Outpatient Consultation',
  },
}

/**
 * Paperless intake form driven by Citizens Charter field definitions.
 */
export default function CharterServiceForm({
  serviceName,
  charterKey: charterKeyProp,
  data = {},
  onChange = () => {},
  readOnly = false,
}) {
  const charterKey = charterKeyProp || resolveCharterKeyFromServiceName(serviceName)
  const charter = charterKey ? getCharterByCode(charterKey) : null
  const theme = THEME[charterKey] || {
    accent: 'from-teal-600 via-teal-700 to-slate-800',
    eyebrow: serviceName || 'Service intake',
  }

  if (!charter?.intakeFields?.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No intake fields configured for this service.
      </div>
    )
  }

  const handleChange = (e) => {
    if (readOnly) return
    const { name, value, type, checked } = e.target
    onChange({
      ...data,
      [name]: type === 'checkbox' ? checked : value,
    })
  }

  return (
    <div className="w-full">
      <div className={`mb-6 rounded-3xl bg-gradient-to-r ${theme.accent} p-6 text-white shadow-lg md:p-8`}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">{theme.eyebrow}</p>
        <h2 className="mt-1 text-xl font-black tracking-tight md:text-2xl">{charter.title}</h2>
        {charter.requirements?.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-white/90 md:text-sm">
            {charter.requirements.map((req) => (
              <li key={req}>{req}</li>
            ))}
          </ul>
        ) : null}
        {charter.feeNote ? <p className="mt-3 text-xs font-semibold text-white/90">Fee: {charter.feeNote}</p> : null}
      </div>

      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-slate-200/40 md:p-8">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {charter.intakeFields.map((field) => {
            if (field.type === 'checkbox_group') {
              return (
                <CheckboxGroup
                  key={field.name}
                  label={field.label}
                  name={field.name}
                  options={field.options || []}
                  data={data}
                  onChange={onChange}
                  disabled={readOnly}
                />
              )
            }
            if (field.type === 'textarea') {
              return (
                <TextAreaField
                  key={field.name}
                  label={field.label}
                  name={field.name}
                  required={Boolean(field.required)}
                  data={data}
                  onChange={handleChange}
                  disabled={readOnly}
                  placeholder={field.placeholder || ''}
                />
              )
            }
            if (field.type === 'select') {
              return (
                <SelectField
                  key={field.name}
                  label={field.label}
                  name={field.name}
                  options={field.options || []}
                  required={Boolean(field.required)}
                  data={data}
                  onChange={handleChange}
                  disabled={readOnly}
                />
              )
            }
            return (
              <FormField
                key={field.name}
                label={field.label}
                name={field.name}
                type={field.type || 'text'}
                required={Boolean(field.required)}
                data={data}
                onChange={handleChange}
                disabled={readOnly}
                placeholder={field.placeholder || ''}
              />
            )
          })}
        </div>
      </section>
    </div>
  )
}

export function getCharterKeyForServiceName(serviceName) {
  return resolveCharterKeyFromServiceName(serviceName)
}
