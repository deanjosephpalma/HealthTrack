export const EMERGENCY_NURSE_EMAIL = 'zuleika.jacosalem@healthtrack.com'

export function isHighVitalReferral(emergencyCase, policy) {
  // Automatic referrals retain their original eligibility even if cutoffs change.
  // Direct incidents and manual urgent referrals appear in Nurse Consult instead.
  return emergencyCase.source === 'bhw' &&
    (!emergencyCase.vitals?.emergency_manual || triageReasons({ ...emergencyCase.vitals, emergency_manual: false }, policy).length > 0)
}

export function isEmergencyNurse(profile, user) {
  return profile?.role === 'Nurse' && (profile?.email || user?.email || '').trim().toLowerCase() === EMERGENCY_NURSE_EMAIL
}

export function parseBloodPressure(value) {
  const match = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(String(value || ''))
  if (!match) return null
  return { systolic: Number(match[1]), diastolic: Number(match[2]) }
}

function validThreshold(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

/** Three-level decision support; a clinician still confirms disposition. */
export function classifyTriage(data = {}, policy) {
  if (!policy?.enabled) return { level: 'unclassified', reasons: [] }
  const bp = parseBloodPressure(data.bp)
  const rawTemp = String(data.temp ?? '').trim()
  const temp = rawTemp && Number.isFinite(Number(rawTemp)) ? Number(rawTemp) : null
  const redLowSystolic = validThreshold(policy.low_systolic)
  const redSystolic = validThreshold(policy.systolic)
  const redDiastolic = validThreshold(policy.diastolic)
  const redTemperature = validThreshold(policy.temperature)
  const yellowSystolic = validThreshold(policy.yellow_systolic)
  const yellowDiastolic = validThreshold(policy.yellow_diastolic)
  const yellowTemperature = validThreshold(policy.yellow_temperature)
  const redReasons = []
  const yellowReasons = []

  if (data.emergency_manual) redReasons.push('Manual urgent referral')
  if (bp && redLowSystolic !== null && bp.systolic <= redLowSystolic) redReasons.push(`Low BP: ${data.bp} mmHg`)
  if (bp && ((redSystolic !== null && bp.systolic >= redSystolic) || (redDiastolic !== null && bp.diastolic >= redDiastolic))) redReasons.push(`High BP: ${data.bp} mmHg`)
  if (temp !== null && redTemperature !== null && temp >= redTemperature) redReasons.push(`High temperature: ${rawTemp} °C`)
  if (redReasons.length) return { level: 'red', reasons: redReasons }

  if (bp && yellowSystolic !== null && bp.systolic >= yellowSystolic) yellowReasons.push(`Elevated systolic BP: ${data.bp} mmHg`)
  else if (bp && yellowDiastolic !== null && bp.diastolic >= yellowDiastolic) yellowReasons.push(`Elevated diastolic BP: ${data.bp} mmHg`)
  if (temp !== null && yellowTemperature !== null && temp >= yellowTemperature) yellowReasons.push(`Elevated temperature: ${rawTemp} °C`)

  return yellowReasons.length ? { level: 'yellow', reasons: yellowReasons } : { level: 'green', reasons: [] }
}

export function triageReasons(data = {}, policy) {
  const result = classifyTriage(data, policy)
  return result.level === 'red' ? result.reasons : []
}
