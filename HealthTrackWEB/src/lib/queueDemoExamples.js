/**
 * Queue pages import these helpers for a uniform UI shape. Demo entries are
 * deliberately empty so a new black-box test begins with real data only.
 */
export const ENCODE_DESK_DEMO_ROWS = []
export const QUEUE_DEMO_ROWS = []

export function isDemoQueueRow() {
  return false
}

export function linePositionLabel(index) {
  const n = Number(index)
  if (!Number.isFinite(n) || n < 0) return ''
  return n === 0 ? 'Next' : 'Waiting'
}
