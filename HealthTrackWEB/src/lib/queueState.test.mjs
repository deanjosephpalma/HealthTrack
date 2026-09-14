import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextQueueItem, shouldMergeQueueRow } from './queueState.js'

test('called ticket is never next when no one is waiting', () => {
  assert.equal(nextQueueItem([{ id: 'a', status: 'called' }, { id: 'b', status: 'skipped' }]), null)
})
test('explicit next wins; otherwise choose a waiting ticket', () => {
  const rows = [{ id: 'a', status: 'called' }, { id: 'b', status: 'waiting' }, { id: 'c', status: 'next' }]
  assert.equal(nextQueueItem(rows).id, 'c')
  assert.equal(nextQueueItem(rows.slice(0, 2)).id, 'b')
})
test('server completion replaces clean called cache despite browser clock skew', () => {
  assert.equal(shouldMergeQueueRow({ synced: 1, status: 'called', updated_at: '2026-09-14T12:30:00Z' }, { status: 'completed', updated_at: '2026-09-14T12:00:00Z' }), true)
})
test('pull cannot discard an unsent completion or pending new ticket', () => {
  assert.equal(shouldMergeQueueRow({ synced: 0, status: 'completed' }, { status: 'called' }), false)
  assert.equal(shouldMergeQueueRow({ synced: 1, pending_create: 1 }, { status: 'called' }), false)
})
