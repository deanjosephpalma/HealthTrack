import test from 'node:test'
import assert from 'node:assert/strict'
import { triageReasons, isEmergencyNurse } from './emergencyTriage.js'

// Synthetic thresholds for boundary testing, not clinical recommendations.
const policy = { enabled: true, systolic: 150, diastolic: 95, temperature: 39 }
test('either BP component or temperature independently triggers referral including boundary', () => {
  assert.equal(triageReasons({ bp: '150/80' }, policy).length, 1)
  assert.equal(triageReasons({ bp: '120/95' }, policy).length, 1)
  assert.equal(triageReasons({ temp: '39' }, policy).length, 1)
  assert.equal(triageReasons({ bp: '151/96', temp: '39.1' }, policy).length, 2)
  assert.deepEqual(triageReasons({ bp: '149/94', temp: '38.9' }, policy), [])
})
test('disabled policy and missing readings do not invent referrals', () => {
  assert.deepEqual(triageReasons({ bp: '200/120' }, null), [])
  assert.deepEqual(triageReasons({ bp: '200/120' }, { ...policy, enabled: false }), [])
  assert.deepEqual(triageReasons({ bp: 'abc', temp: '' }, policy), [])
  assert.equal(triageReasons({ bp: ' 150 / 80 ' }, policy).length, 1)
})
test('only the designated nurse gets the emergency home page', () => {
  assert.equal(isEmergencyNurse({ role: 'Nurse', email: 'ZULEIKA.JACOSALEM@healthtrack.com' }), true)
  assert.equal(isEmergencyNurse({ role: 'BHW', email: 'zuleika.jacosalem@healthtrack.com' }), false)
  assert.equal(isEmergencyNurse({ role: 'Nurse', email: 'other@healthtrack.com' }), false)
})
