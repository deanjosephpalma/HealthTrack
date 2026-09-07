import { isDoctorBoundQueueItem } from './doctorServices'

/** Permit / admin services handled by Nurse (not Doctor Consult). */
export const NURSE_DESK_PREFIXES = new Set([
  'EC',
  'ECT',
  'DC',
  'RDC',
  'HC',
  'IHC',
  'SP',
  'ISP',
  'PM',
  'PMC',
])

export const NURSE_DESK_NAME_MATCHERS = [
  { kind: 'exhumation_permit', test: (n) => /exhumation|cremation|transfer/i.test(n) },
  { kind: 'death_certificate', test: (n) => /death\s*cert/i.test(n) },
  { kind: 'health_card', test: (n) => /health\s*card/i.test(n) },
  { kind: 'sanitary_permit', test: (n) => /sanitary/i.test(n) },
  { kind: 'pre_marriage', test: (n) => /pre-?\s*marriage|premarriage/i.test(n) },
]

export function resolveNurseDeskKind({ serviceCode, serviceName } = {}) {
  const name = (serviceName ?? '').toString()
  // Medical certificate is doctor-only — never nurse desk
  if (/medical\s*cert|med\s*cert|medico-?legal/i.test(name)) return null
  const code = (serviceCode ?? '').toString().trim().toUpperCase()
  if (code === 'MC' || code === 'IMC') return null

  if (NURSE_DESK_PREFIXES.has(code)) {
    if (code === 'EC' || code === 'ECT') return 'exhumation_permit'
    if (code === 'DC' || code === 'RDC') return 'death_certificate'
    if (code === 'HC' || code === 'IHC') return 'health_card'
    if (code === 'SP' || code === 'ISP') return 'sanitary_permit'
    if (code === 'PM' || code === 'PMC') return 'pre_marriage'
  }

  for (const m of NURSE_DESK_NAME_MATCHERS) {
    if (m.test(name)) return m.kind
  }
  return null
}

export function nurseDeskKindLabel(kind) {
  if (kind === 'exhumation_permit') return 'Exhumation / Cremation / Transfer Permit'
  if (kind === 'death_certificate') return 'Review of Death Certificate'
  if (kind === 'health_card') return 'Health Card Issuance'
  if (kind === 'sanitary_permit') return 'Sanitary Permit Issuance'
  if (kind === 'pre_marriage') return 'Pre-marriage Counseling'
  return 'Nurse desk service'
}

export function isNurseDeskQueueItem(item, serviceNameById = new Map()) {
  if (isDoctorBoundQueueItem(item, serviceNameById)) return false
  const name = item.service_name || serviceNameById.get(item.service_id) || ''
  return Boolean(resolveNurseDeskKind({ serviceCode: item.service_code, serviceName: name }))
}
