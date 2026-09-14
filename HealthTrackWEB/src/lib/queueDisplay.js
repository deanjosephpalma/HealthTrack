import { compareByPriorityThenArrival } from './patientPriority.js'

export function ticketLabel(row) {
  return row.queue_label || `${row.service_code || 'RHU'}-${String(row.queue_number).padStart(3, '0')}`
}

const manilaDate = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

export function displayTickets(rows, now = new Date(), room = '') {
  const today = manilaDate(now)
  return rows.filter((row) => {
    const created = new Date(row.created_at)
    return !row.archived_at && !Number.isNaN(created.getTime()) && manilaDate(created) === today
      && ['waiting', 'next', 'called'].includes(row.status)
      && Boolean(row.queue_label || row.queue_number)
      && (!room || row.counter_room === room)
  }).sort(compareByPriorityThenArrival)
}
