/** Senior Citizen (age ≥ 60) and PWD priority helpers.
 * Serving order: priority lane first, then regular lane.
 * Within each lane: first-come, first-served (by arrival / created_at).
 */

export const SENIOR_AGE_YEARS = 60

export function ageFromBirthdate(birthdate, now = new Date()) {
  if (!birthdate) return null
  const birth = new Date(birthdate)
  if (Number.isNaN(birth.getTime())) return null
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1
  return age >= 0 ? age : null
}

export function isSeniorCitizen(birthdate, now = new Date()) {
  const age = ageFromBirthdate(birthdate, now)
  return age != null && age >= SENIOR_AGE_YEARS
}

/** Non-empty disability text (except common “none” values) counts as PWD. */
export function isPwdStatus(disability) {
  const t = (disability ?? '').toString().trim().toLowerCase()
  if (!t) return false
  return !['none', 'n/a', 'na', 'no', 'not applicable', '-'].includes(t)
}

/**
 * Resolve priority from patient demographics and/or explicit flags.
 * @returns {{ isPriority: boolean, isSenior: boolean, isPwd: boolean, labels: string[], label: string }}
 */
export function resolvePatientPriority({
  birthdate = null,
  disability = null,
  is_senior = null,
  is_pwd = null,
  is_priority = null,
  priority_labels = null,
  reason = null,
} = {}) {
  const senior = is_senior === true || is_senior === 'true' || isSeniorCitizen(birthdate)
  const pwd = is_pwd === true || is_pwd === 'true' || isPwdStatus(disability)

  let labels = []
  if (Array.isArray(priority_labels)) {
    labels = priority_labels.map((x) => String(x).trim()).filter(Boolean)
  } else if (typeof priority_labels === 'string' && priority_labels.trim()) {
    labels = priority_labels
      .split(/[,/|]/)
      .map((x) => x.trim())
      .filter(Boolean)
  }

  if (labels.length === 0 && reason) {
    const m = String(reason).match(/\[PRIORITY:\s*([^\]]+)\]/i)
    if (m?.[1]) {
      labels = m[1]
        .split(/[,/|]/)
        .map((x) => x.trim())
        .filter(Boolean)
    }
  }

  if (labels.length === 0) {
    if (senior) labels.push('Senior')
    if (pwd) labels.push('PWD')
  }

  const unique = [...new Set(labels)]
  const finalLabels = unique.length
    ? unique
    : [...(senior ? ['Senior'] : []), ...(pwd ? ['PWD'] : [])]

  return {
    isPriority: finalLabels.length > 0 || is_priority === true || is_priority === 1 || is_priority === 'true',
    isSenior: senior || finalLabels.some((l) => /senior/i.test(l)),
    isPwd: pwd || finalLabels.some((l) => /pwd/i.test(l)),
    labels: finalLabels,
    label: finalLabels.join(' / '),
  }
}

/** Sort key: priority lane first (0), then regular (1). */
export function prioritySortRank(row) {
  if (!row) return 1
  if (row.is_priority === true || row.is_priority === 1 || row.isPriority === true) return 0
  const resolved = resolvePatientPriority(row)
  return resolved.isPriority ? 0 : 1
}

/** Arrival time used for FCFS within a lane. */
export function arrivalTimestamp(row) {
  if (!row) return ''
  const fromIntake =
    row.intake_data && typeof row.intake_data === 'object' ? row.intake_data.line_joined_at : null
  return String(row.line_joined_at || fromIntake || row.created_at || '')
}

/**
 * Priority lane first, then first-come-first-served by arrival within each lane.
 * Senior vs PWD are equal — whoever joined earlier goes first.
 */
export function compareByPriorityThenArrival(a, b) {
  const d = prioritySortRank(a) - prioritySortRank(b)
  if (d !== 0) return d
  return arrivalTimestamp(a).localeCompare(arrivalTimestamp(b))
}

/** @deprecated Prefer compareByPriorityThenArrival */
export function compareByPriorityThenCreatedAt(a, b) {
  return compareByPriorityThenArrival(a, b)
}
