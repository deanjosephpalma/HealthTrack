import test from 'node:test'
import assert from 'node:assert/strict'
import { emergencyStatus } from './emergencyStatus.js'

test('regular encoded requests stay in the regular workflow', () => {
  assert.equal(emergencyStatus({ status: 'Encoded', intake_data: {} }), null)
})
test('legacy emergency referrals never ask for a queue ticket', () => {
  const result = emergencyStatus({ status: 'Encoded', intake_data: { emergency_referred: true } })
  assert.equal(result.active, true)
  assert.equal(result.title, 'Referred to Nurse Zuleika')
})
test('care, completion, and external referral have distinct patient statuses', () => {
  const make = status => emergencyStatus({ intake_data: { emergency_referred: true, emergency_status: status } })
  assert.equal(make('in_care').title, 'Consultation in progress')
  assert.equal(make('in_care').active, true)
  assert.equal(make('completed').title, 'Consultation completed')
  assert.equal(make('completed').active, false)
  assert.equal(make('referred').title, 'Referred / transferred')
  assert.equal(make('referred').active, false)
})
