import test from 'node:test'
import assert from 'node:assert/strict'
import { triageReasons, isEmergencyNurse, isHighVitalReferral } from './emergencyTriage.js'

// Synthetic thresholds for boundary testing, not clinical recommendations.
const policy = { enabled: true, systolic: 150, diastolic: 95, temperature: 39 }
test('priority queue includes automatic referrals and elevated manual referrals, excludes direct incidents', () => {
  assert.equal(isHighVitalReferral({ source: 'bhw', vitals: { bp: '150/80' } }, null), true)
  assert.equal(isHighVitalReferral({ source: 'bhw', vitals: { emergency_manual: true, temp: '39' } }, policy), true)
  assert.equal(isHighVitalReferral({ source: 'bhw', vitals: { emergency_manual: true, bp: '120/80' } }, policy), false)
  assert.equal(isHighVitalReferral({ source: 'direct', vitals: { temp: '40' } }, policy), false)
})
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
