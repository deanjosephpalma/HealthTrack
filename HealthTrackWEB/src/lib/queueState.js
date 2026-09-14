export function nextQueueItem(rows) {
  return rows.find((row) => row.status?.toLowerCase() === 'next')
    ?? rows.find((row) => row.status?.toLowerCase() === 'waiting')
    ?? null
}

export function shouldMergeQueueRow(local, remote) {
  if (local.pending_create) return false
  // A clean cache is a server snapshot; browser clock skew must not pin old statuses.
  if (local.synced === 1) return true
  // Keep unsent local edits until the outbox has acknowledged them.
  if (local.synced === 0) return false
  return Date.parse(remote.updated_at || remote.created_at) >= Date.parse(local.updated_at || local.created_at)
}
