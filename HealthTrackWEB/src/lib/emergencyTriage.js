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

/** Three-level decision support; a clinician still confirms disposition. */
export function classifyTriage(data = {}, policy) {
  if (!policy?.enabled) return { level: 'unclassified', reasons: [] }
  const bp = parseBloodPressure(data.bp)
  const rawTemp = String(data.temp ?? '').trim()
  const temp = rawTemp && Number.isFinite(Number(rawTemp)) ? Number(rawTemp) : null
  const redReasons = []
  const yellowReasons = []

  if (data.emergency_manual) redReasons.push('Manual urgent referral')
  if (bp && Number.isFinite(Number(policy.low_systolic)) && bp.systolic <= Number(policy.low_systolic)) redReasons.push(`Low BP: ${data.bp} mmHg`)
  if (bp && (bp.systolic >= Number(policy.systolic) || bp.diastolic >= Number(policy.diastolic))) redReasons.push(`High BP: ${data.bp} mmHg`)
  if (temp !== null && temp >= Number(policy.temperature)) redReasons.push(`High temperature: ${rawTemp} °C`)
  if (redReasons.length) return { level: 'red', reasons: redReasons }

  if (bp && Number.isFinite(Number(policy.yellow_systolic)) && bp.systolic >= Number(policy.yellow_systolic)) yellowReasons.push(`Elevated systolic BP: ${data.bp} mmHg`)
  else if (bp && Number.isFinite(Number(policy.yellow_diastolic)) && bp.diastolic >= Number(policy.yellow_diastolic)) yellowReasons.push(`Elevated diastolic BP: ${data.bp} mmHg`)
  if (temp !== null && Number.isFinite(Number(policy.yellow_temperature)) && temp >= Number(policy.yellow_temperature)) yellowReasons.push(`Elevated temperature: ${rawTemp} °C`)

  return yellowReasons.length ? { level: 'yellow', reasons: yellowReasons } : { level: 'green', reasons: [] }
}

export function triageReasons(data = {}, policy) {
  const result = classifyTriage(data, policy)
  return result.level === 'red' ? result.reasons : []
}
