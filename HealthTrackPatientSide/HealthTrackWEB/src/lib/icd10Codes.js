/** RHU Pila morbidity ICD-10 list (clinic reference sheet). */
export const ICD10_OTHER = 'OTHER'

/**
 * `id` is unique for the dropdown (some ICD codes repeat with different names).
 * Stored diagnosis format: "NAME (CODE)" e.g. "URTI (J06.9)"
 */
export const ICD10_CODES = [
  { id: 'age', code: 'A09', label: 'A.G.E.' },
  { id: 'allergy', code: 'T78.4', label: 'ALLERGY' },
  { id: 'animal-bite', code: 'T14.1', label: 'ANIMAL BITE' },
  { id: 'arthritis', code: 'M13.9', label: 'ARTHRITIS' },
  { id: 'asthma', code: 'J45', label: 'ASTHMA' },
  { id: 'boil', code: 'L02.9', label: 'BOIL' },
  { id: 'bph', code: 'N40', label: 'BPH - DIFF. OF URINATING' },
  { id: 'cellulitis', code: 'L03', label: 'CELLULITIS' },
  { id: 'chf', code: 'I50.0', label: 'CHF' },
  { id: 'copd', code: 'J44.9', label: 'COPD' },
  { id: 'cad', code: 'I25.1', label: 'CORONARY ARTERY DISEASE' },
  { id: 'covid-pos', code: 'U07.1', label: 'COVID POSITIVE' },
  { id: 'covid-suspect', code: 'U07.2', label: 'COVID SUSPECT' },
  { id: 'dental-caries', code: 'K02', label: 'DENTAL CARIES' },
  { id: 'dm-type-ii', code: 'E11', label: 'DM TYPE II' },
  { id: 'essentially-normal', code: '000', label: 'ESSENTIALLY NORMAL' },
  { id: 'gastritis', code: 'K29.7', label: 'GASTRITIS' },
  { id: 'gerd', code: 'K21.9', label: 'GERD' },
  { id: 'gouty-arthritis', code: 'M10.09', label: 'GOUTY ARTHRITIS' },
  { id: 'hpn-st-ii', code: 'I10.1', label: 'HPN ST II' },
  { id: 'hypercholesterolemia', code: 'E78.00', label: 'HYPERCHOLESTEROLEMIA' },
  { id: 'hyperlipidemia', code: 'E78.5', label: 'HYPERLIPIDEMIA' },
  { id: 'hypersensitivity', code: 'T78.4', label: 'HYPERSENSITIVITY REACTION' },
  { id: 'hyperuricemia', code: 'E79.0', label: 'HYPERURICEMIA' },
  { id: 'lbm', code: 'K52.9', label: 'LBM' },
  { id: 'msdo', code: 'M79.9', label: 'MSDO' },
  { id: 'nud', code: 'K30.1', label: 'NUD' },
  { id: 'pneumonia', code: 'J16', label: 'PNEUMONIA' },
  { id: 'tonsillitis', code: 'J03.9', label: 'TONSILLITIS' },
  { id: 'urti', code: 'J06.9', label: 'URTI' },
  { id: 'uti', code: 'N39.0', label: 'UTI' },
  { id: 'vertigo', code: 'R42', label: 'VERTIGO' },
  { id: 'wounds', code: 'T01.9', label: 'WOUNDS' },
]

export function formatIcd10Diagnosis(id, otherText = '') {
  if (!id) return ''
  if (id === ICD10_OTHER) {
    const text = (otherText || '').toString().trim()
    return text ? `OTHER: ${text}` : ''
  }
  const row = ICD10_CODES.find((c) => c.id === id || c.code === id)
  if (!row) return id
  return `${row.label} (${row.code})`
}

/** Parse a stored diagnosis string back into dropdown state. */
export function parseIcd10Diagnosis(stored) {
  const text = (stored ?? '').toString().trim()
  if (!text) return { code: '', otherText: '' }

  if (/^OTHER\s*:/i.test(text)) {
    return { code: ICD10_OTHER, otherText: text.replace(/^OTHER\s*:\s*/i, '').trim() }
  }

  const byStored = ICD10_CODES.find((c) => text === `${c.label} (${c.code})`)
  if (byStored) return { code: byStored.id, otherText: '' }

  const byLegacy = ICD10_CODES.find(
    (c) => text === `${c.code} — ${c.label}` || text.startsWith(`${c.code} —`) || text === `${c.code} - ${c.label}`,
  )
  if (byLegacy) return { code: byLegacy.id, otherText: '' }

  const byLabel = ICD10_CODES.find((c) => text.toUpperCase() === c.label.toUpperCase())
  if (byLabel) return { code: byLabel.id, otherText: '' }

  const byCode = ICD10_CODES.find((c) => text === c.code || text.includes(`(${c.code})`))
  if (byCode) return { code: byCode.id, otherText: '' }

  return { code: ICD10_OTHER, otherText: text }
}
