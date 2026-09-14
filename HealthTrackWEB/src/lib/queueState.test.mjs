import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextQueueItem, shouldMergeQueueRow, queueAdvanceChanges } from './queueState.js'

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

const ticket = (id, status, extra = {}) => ({ id, status, counter_room: 'Service Desk', created_at: `2026-09-14T08:00:0${id.charCodeAt(0) - 97}Z`, ...extra })

test('calling A marks B next; completing A calls B and marks C next', () => {
  let rows = [ticket('a', 'waiting'), ticket('b', 'waiting'), ticket('c', 'waiting')]
  const called = queueAdvanceChanges(rows, 'a', 'called')
  assert.deepEqual(called, [{ id: 'a', status: 'called' }, { id: 'b', status: 'next' }])
  rows = rows.map((row) => ({ ...row, ...called.find((change) => change.id === row.id) }))
  assert.deepEqual(queueAdvanceChanges(rows, 'a', 'completed'), [
    { id: 'a', status: 'completed' }, { id: 'b', status: 'called' }, { id: 'c', status: 'next' },
  ])
})

test('auto advancement respects counter, priority, and excludes skipped/archived tickets', () => {
  const rows = [ticket('a', 'called'), ticket('b', 'waiting', { counter_room: 'Doctor Consult' }),
    ticket('c', 'skipped'), ticket('d', 'waiting', { archived_at: '2026-09-14' }),
    ticket('e', 'waiting'), ticket('f', 'waiting', { is_priority: true })]
  assert.deepEqual(queueAdvanceChanges(rows, 'a', 'completed'), [
    { id: 'a', status: 'completed' }, { id: 'f', status: 'called' }, { id: 'e', status: 'next' },
  ])
})

test('an explicitly marked next keeps its place', () => {
  assert.deepEqual(queueAdvanceChanges([ticket('a', 'called'), ticket('b', 'waiting'), ticket('c', 'next')], 'a', 'done'), [
    { id: 'a', status: 'done' }, { id: 'c', status: 'called' }, { id: 'b', status: 'next' },
  ])
})

test('completion is harmless with an empty lane, or when repeated', () => {
  assert.deepEqual(queueAdvanceChanges([ticket('a', 'called')], 'a', 'completed'), [{ id: 'a', status: 'completed' }])
  assert.deepEqual(queueAdvanceChanges([ticket('a', 'completed'), ticket('b', 'called')], 'a', 'completed'), [])
})

test('completing an uncalled patient or one of multiple serving patients does not call another', () => {
  assert.deepEqual(queueAdvanceChanges([ticket('a', 'waiting'), ticket('b', 'waiting')], 'a', 'completed'), [{ id: 'a', status: 'completed' }])
  assert.deepEqual(queueAdvanceChanges([ticket('a', 'called'), ticket('b', 'called'), ticket('c', 'next')], 'a', 'completed'), [{ id: 'a', status: 'completed' }])
})

test('manual skip stays manual and calling normalizes duplicate next labels', () => {
  const rows = [ticket('a', 'waiting'), ticket('b', 'next'), ticket('c', 'next')]
  assert.deepEqual(queueAdvanceChanges(rows, 'a', 'skipped'), [{ id: 'a', status: 'skipped' }])
  assert.deepEqual(queueAdvanceChanges(rows, 'a', 'called'), [{ id: 'a', status: 'called' }, { id: 'c', status: 'waiting' }])
})
