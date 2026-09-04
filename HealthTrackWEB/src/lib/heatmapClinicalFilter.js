import { ICD10_CODES, ICD10_OTHER, parseIcd10Diagnosis } from './icd10Codes'

const NURSE_DESK_OUTCOME = /^Nurse desk outcome:/i

/** Diagnosis text that reflects permit/certificate issuance, not clinical disease (legacy rows). */
const ADMIN_ONLY_DIAGNOSIS =
  /^(health\s*card|sanitary\s*permit|exhumation|cremation|transfer|death\s*certificate|pre-?\s*marriage|medical\s*certificate)(\s|$|\/|issued|released)/i

function hasMedcertPurposeFlags(row) {
  return Boolean(
    row.medcert_pwd ||
      row.medcert_work ||
      row.medcert_financial ||
      row.medcert_4ps ||
      row.medcert_school ||
      (row.medcert_others ?? '').toString().trim(),
  )
}

/**
 * Permit / certificate-only visits (nurse desk + medical certificate issuance).
 * These must not appear on outbreak heat maps.
 */
export function isPermitCertificateOnlyRecord(row = {}) {
  const notes = (row.notes ?? '').toString().trim()
  if (NURSE_DESK_OUTCOME.test(notes)) return true

  if (row.nurse_completed_at && !row.doctor_completed_at) return true

  if (hasMedcertPurposeFlags(row)) return true

  const dx = (row.diagnosis ?? '').toString().trim()
  if (dx && ADMIN_ONLY_DIAGNOSIS.test(dx)) return true

  return false
}

/**
 * True when diagnosis is from the RHU ICD-10 morbidity list (or doctor "Others").
 * Excludes "Essentially Normal" — not an outbreak case.
 */
export function isHeatMapIcd10Diagnosis(stored) {
  const text = (stored ?? '').toString().trim()
  if (!text) return false

  const parsed = parseIcd10Diagnosis(text)
  if (!parsed.code) return false

  if (parsed.code === ICD10_OTHER) {
    return Boolean((parsed.otherText || '').trim())
  }

  const row = ICD10_CODES.find((c) => c.id === parsed.code || c.code === parsed.code)
  if (!row) return false
  if (row.id === 'essentially-normal' || row.code === '000') return false
  return true
}

/**
 * Clinical heat-map row: doctor consult with ICD-10 diagnosis only.
 * Reported Cases (`estimated_cases`) are loaded separately — not via this helper.
 * TB rows may use classification / TB wording when ICD list has no TB entry.
 */
export function isHeatMapClinicalRecord(row = {}) {
  if (isPermitCertificateOnlyRecord(row)) return false
  if (!row.doctor_completed_at) return false

  const dx = (row.diagnosis ?? '').toString().trim()
  const notes = (row.notes ?? '').toString()
  const isTb =
    Boolean(row.tb_classification) ||
    notes.includes('[TB Treatment Record]') ||
    /tuberculosis|\btb\b/i.test(dx)

  if (isTb) return true
  return isHeatMapIcd10Diagnosis(dx)
}

export function filterHeatMapClinicalRecords(rows = []) {
  return rows.filter(isHeatMapClinicalRecord)
}
