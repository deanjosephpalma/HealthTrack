/** Official-style PWD disability categories (PH), sorted A–Z for dropdowns. */
export const PWD_DISABILITY_TYPES = [
  'Chronic Illness',
  'Communication Disability',
  'Hearing Disability',
  'Intellectual Disability',
  'Learning Disability',
  'Mental Disability',
  'Multiple Disabilities',
  'Orthopedic / Physical Disability',
  'Other',
  'Psychosocial Disability',
  'Speech Impairment',
  'Visual Disability',
].slice().sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))

export function isKnownPwdType(value) {
  const t = String(value || '').trim()
  if (!t) return false
  return PWD_DISABILITY_TYPES.some((opt) => opt.toLowerCase() === t.toLowerCase())
}
