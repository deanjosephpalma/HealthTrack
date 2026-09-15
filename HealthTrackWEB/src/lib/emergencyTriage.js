export const EMERGENCY_NURSE_EMAIL = 'zuleika.jacosalem@healthtrack.com'

export function isEmergencyNurse(profile, user) {
  return profile?.role === 'Nurse' && (profile?.email || user?.email || '').trim().toLowerCase() === EMERGENCY_NURSE_EMAIL
}

export function triageReasons(data = {}, policy) {
  if (!policy?.enabled) return []
  const reasons = []
  const bp = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(String(data.bp || ''))
  if (bp && (+bp[1] >= policy.systolic || +bp[2] >= policy.diastolic)) reasons.push(`High BP: ${data.bp} mmHg`)
  const temp = String(data.temp ?? '').trim()
  if (temp && Number.isFinite(Number(temp)) && Number(temp) >= policy.temperature) reasons.push(`High temperature: ${temp} °C`)
  return reasons
}
