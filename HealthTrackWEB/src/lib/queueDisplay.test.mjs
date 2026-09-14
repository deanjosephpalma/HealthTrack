import { test } from 'node:test'
import assert from 'node:assert/strict'
import { displayTickets, ticketLabel } from './queueDisplay.js'

const now = new Date('2026-09-14T16:01:00Z') // September 15 in Manila.
const ticket = (id, extra = {}) => ({ id, created_at: '2026-09-14T16:00:00Z', queue_number: 1, status: 'waiting', ...extra })

test('display excludes previous Manila day, archived, finished, skipped and unnumbered entries', () => {
  const rows = [ticket('today'), ticket('yesterday', { created_at: '2026-09-14T15:59:59Z' }),
    ticket('archived', { archived_at: now.toISOString() }), ticket('done', { status: 'completed' }),
    ticket('skipped', { status: 'skipped' }), ticket('no-ticket', { queue_number: null }),
    ticket('invalid', { created_at: 'invalid' })]
  assert.deepEqual(displayTickets(rows, now).map((row) => row.id), ['today'])
})

test('filter respects desk and keeps explicitly called and next statuses', () => {
  const rows = [ticket('a', { counter_room: 'Desk A', status: 'called' }), ticket('b', { counter_room: 'Desk B', status: 'next' })]
  assert.deepEqual(displayTickets(rows, now, 'Desk B').map((row) => row.id), ['b'])
  assert.equal(displayTickets(rows, now).length, 2)
})

test('ticket uses service prefix and never patient name', () => {
  assert.equal(ticketLabel(ticket('a', { patient_name: 'Private Name', service_code: 'OPD', queue_number: 23 })), 'OPD-023')
  assert.equal(ticketLabel(ticket('b', { queue_label: 'AB-010' })), 'AB-010')
})

test('waiting list keeps priority ordering without mutating the source', () => {
  const rows = [ticket('regular'), ticket('priority', { is_priority: true, created_at: '2026-09-14T16:00:30Z' })]
  assert.deepEqual(displayTickets(rows, now).map((row) => row.id), ['priority', 'regular'])
  assert.equal(rows[0].id, 'regular')
})
