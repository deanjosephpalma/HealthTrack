/**
 * Map RHU service_types.name (or similar labels) → citizen charter key.
 */
export function resolveCharterKeyFromServiceName(serviceName) {
  const n = (serviceName ?? '').toString().toLowerCase()
  if (!n) return null
  if (/animal\s*bite|anti-?rabies/.test(n)) return 'animal_bite_anti_rabies'
  if (/outpatient|opd/.test(n)) return 'outpatient_consultation'
  if (/exhumation|cremation|transfer\s*permit/.test(n)) return 'exhumation_cremation_transfer_permit'
  if (/death\s*cert/.test(n)) return 'review_death_certificate'
  if (/health\s*card/.test(n)) return 'health_card_issuance'
  if (/medical\s*cert|med\s*cert|medico-?legal/.test(n)) return 'medical_certificate_issuance'
  if (/sanitary\s*permit/.test(n)) return 'sanitary_permit_issuance'
  if (/tuberculosis|\btb\b/.test(n)) return 'tuberculosis_treatment_services'
  if (/pre-?marriage|premarriage|counseling/.test(n)) return 'pre_marriage_counseling'
  return null
}
