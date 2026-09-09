/**
 * Shared queue display helper.
 */
export function linePositionLabel(index) {
  const n = Number(index)
  if (!Number.isFinite(n) || n < 0) return ''
  return n === 0 ? 'Next' : 'Waiting'
}
