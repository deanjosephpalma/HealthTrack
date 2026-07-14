export function combineDateAndTime(dateValue, timeValue) {
  const date = (dateValue ?? '').toString().trim()
  const time = (timeValue ?? '').toString().trim()
  if (!date || !time) return null
  const parsed = new Date(`${date}T${time}`)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export function todayDateInputValue() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function formatPreferredScheduleTime(value) {
  const raw = (value ?? '').toString().trim()
  if (!raw) return '—'
  const match = raw.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return raw
  const hours = Number(match[1])
  const minutes = match[2]
  if (!Number.isFinite(hours)) return raw
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${minutes} ${period}`
}

export function formatAppointmentDate(value) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  try {
    return parsed.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function formatAppointmentTime(appointmentDate, preferredSchedule) {
  const schedule = (preferredSchedule ?? '').toString().trim()
  if (schedule) return formatPreferredScheduleTime(schedule)

  const parsed = new Date(appointmentDate)
  if (Number.isNaN(parsed.getTime())) return '—'
  try {
    return parsed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

export function statusLabel(status) {
  const value = (status ?? '').toString().toLowerCase()
  if (value === 'checked_in') return 'Checked-in'
  if (value === 'in_queue') return 'In Queue'
  if (value === 'no_show') return 'No Show'
  if (!value) return 'Scheduled'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function statusClasses(status) {
  const value = (status ?? '').toString().toLowerCase()
  if (value === 'scheduled') return 'border-slate-200 bg-slate-50 text-slate-700'
  if (value === 'checked_in') return 'border-sky-200 bg-sky-50 text-sky-700'
  if (value === 'in_queue') return 'border-amber-200 bg-amber-50 text-amber-700'
  if (value === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (value === 'cancelled' || value === 'no_show') return 'border-rose-200 bg-rose-50 text-rose-700'
  return 'border-slate-200 bg-slate-50 text-slate-700'
}
