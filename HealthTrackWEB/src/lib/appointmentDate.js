/** Local calendar date as YYYY-MM-DD (matches PostgreSQL `date` columns). */
export function localDateInputValue(date = new Date()) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function formatLocalDateLabel(dateValue) {
  const raw = (dateValue ?? '').toString().trim()
  if (!raw) return ''
  const parsed = new Date(`${raw}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return raw
  try {
    return parsed.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return raw
  }
}
