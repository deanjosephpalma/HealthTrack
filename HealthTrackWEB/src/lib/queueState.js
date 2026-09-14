import { compareByPriorityThenArrival } from './patientPriority.js'

export function nextQueueItem(rows) {
  return rows.find((row) => row.status?.toLowerCase() === 'next')
    ?? rows.find((row) => row.status?.toLowerCase() === 'waiting')
    ?? null
}

/** Plan automatic transitions within the same service counter. */
export function queueAdvanceChanges(rows, itemId, newStatus) {
  const item = rows.find((row) => row.id === itemId)
  const statusOf = (row) => String(row.status || '').toLowerCase()
  const roomOf = (row) => String(row.counter_room || '').trim().toLowerCase()
  if (!item || item.archived_at || statusOf(item) === newStatus) return []
  const changes = [{ id: itemId, status: newStatus }]
  if (!['called', 'completed', 'done'].includes(newStatus)) return changes

  const lane = rows.filter((row) => row.id !== itemId && !row.archived_at && roomOf(row) === roomOf(item))
    .sort((a, b) => compareByPriorityThenArrival(a, b) || a.id.localeCompare(b.id))
  const waiting = lane.filter((row) => ['waiting', 'next'].includes(statusOf(row)))
  const candidate = nextQueueItem(waiting)
  const wasCalled = statusOf(item) === 'called'
  const anotherCalled = lane.some((row) => statusOf(row) === 'called')
  let next = candidate
  if (newStatus !== 'called' && wasCalled && !anotherCalled && candidate) {
    changes.push({ id: candidate.id, status: 'called' })
    next = nextQueueItem(waiting.filter((row) => row.id !== candidate.id))
  } else if (newStatus !== 'called' && !anotherCalled) {
    return changes
  }
  for (const row of waiting) {
    if (changes.some((change) => change.id === row.id)) continue
    const status = row.id === next?.id ? 'next' : 'waiting'
    if (statusOf(row) !== status) changes.push({ id: row.id, status })
  }
  return changes
}

export function shouldMergeQueueRow(local, remote) {
  if (local.pending_create) return false
  // A clean cache is a server snapshot; browser clock skew must not pin old statuses.
  if (local.synced === 1) return true
  // Keep unsent local edits until the outbox has acknowledged them.
  if (local.synced === 0) return false
  return Date.parse(remote.updated_at || remote.created_at) >= Date.parse(local.updated_at || local.created_at)
}
