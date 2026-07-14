/** Services that require doctor consultation (queue_prefix / name match). */
export const DOCTOR_QUEUE_PREFIXES = new Set(['AB', 'OPD', 'MC', 'IMC', 'TB'])

export const DOCTOR_SERVICE_NAME_MATCHERS = [
  { prefix: 'AB', test: (n) => /animal\s*bite|anti-?rabies/i.test(n) },
  { prefix: 'OPD', test: (n) => /outpatient/i.test(n) },
  { prefix: 'MC', test: (n) => /medical\s*cert|med\s*cert|medico-?legal/i.test(n) },
  { prefix: 'TB', test: (n) => /tuberculosis|\btb\b/i.test(n) },
]

/** Explicitly never doctor-bound (nurse / admin desk). */
function isNurseOnlyServiceName(name) {
  const n = (name ?? '').toString()
  if (/health\s*card/i.test(n)) return true
  if (/sanitary/i.test(n)) return true
  if (/exhumation|cremation|transfer/i.test(n) && !/medical\s*cert/i.test(n)) return true
  if (/death\s*cert/i.test(n)) return true
  if (/pre-?\s*marriage|premarriage/i.test(n)) return true
  return false
}

export function resolveDoctorServiceKind({ serviceCode, serviceName } = {}) {
  const name = (serviceName ?? '').toString()
  if (isNurseOnlyServiceName(name)) return null

  const code = (serviceCode ?? '').toString().trim().toUpperCase()
  // Health card prefixes must never fall through as doctor
  if (['HC', 'IHC', 'EC', 'ECT', 'SP', 'ISP', 'PM', 'PMC', 'DC', 'RDC'].includes(code)) {
    return null
  }

  if (DOCTOR_QUEUE_PREFIXES.has(code)) {
    if (code === 'AB') return 'animal_bite'
    if (code === 'OPD') return 'outpatient'
    if (code === 'MC' || code === 'IMC') return 'medcert'
    if (code === 'TB') return 'tb'
  }

  for (const m of DOCTOR_SERVICE_NAME_MATCHERS) {
    if (m.test(name)) {
      if (m.prefix === 'AB') return 'animal_bite'
      if (m.prefix === 'OPD') return 'outpatient'
      if (m.prefix === 'MC') return 'medcert'
      if (m.prefix === 'TB') return 'tb'
    }
  }
  return null
}

export function isDoctorBoundQueueItem(item, serviceNameById = new Map()) {
  const name =
    item.service_name ||
    serviceNameById.get(item.service_id) ||
    ''
  return Boolean(resolveDoctorServiceKind({ serviceCode: item.service_code, serviceName: name }))
}

export function queueLabelOf(item) {
  if (item?.queue_label) return item.queue_label
  const prefix = item?.service_code || 'RHU'
  if (item?.queue_number != null) return `${prefix}-${String(item.queue_number).padStart(3, '0')}`
  return '—'
}

export function mergeIntakeResponses(responses = []) {
  const merged = {}
  for (const row of responses) {
    const data = row?.response_data
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      Object.assign(merged, data)
    }
  }
  return merged
}
