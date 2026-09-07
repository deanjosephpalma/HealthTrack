import { ICD10_CODES, ICD10_OTHER } from '../lib/icd10Codes'

export default function Icd10DiagnosisField({
  id = 'doc-diagnosis-icd10',
  code,
  otherText = '',
  onCodeChange,
  onOtherTextChange,
  required = true,
  disabled = false,
}) {
  const showOther = code === ICD10_OTHER

  return (
    <div className="space-y-3">
      <div>
        <label className="field-label" htmlFor={id}>
          Diagnosis (ICD-10) {required ? '*' : null}
        </label>
        <select
          id={id}
          className="field-input"
          value={code || ''}
          onChange={(e) => onCodeChange?.(e.target.value)}
          required={required}
          disabled={disabled}
        >
          <option value="">Select diagnosis…</option>
          {ICD10_CODES.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label} ({row.code})
            </option>
          ))}
          <option value={ICD10_OTHER}>Others (specify)</option>
        </select>
      </div>

      {showOther ? (
        <div>
          <label className="field-label" htmlFor={`${id}-other`}>
            Specify diagnosis *
          </label>
          <input
            id={`${id}-other`}
            type="text"
            className="field-input"
            value={otherText}
            onChange={(e) => onOtherTextChange?.(e.target.value)}
            placeholder="Type diagnosis if not in the list"
            required={required}
            disabled={disabled}
          />
        </div>
      ) : null}
    </div>
  )
}
