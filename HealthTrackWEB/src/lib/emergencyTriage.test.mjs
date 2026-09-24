import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyTriage, triageReasons, isEmergencyNurse, isHighVitalReferral, parseBloodPressure } from './emergencyTriage.js'

// Synthetic thresholds for boundary testing, not clinical recommendations.
const policy = { enabled: true, systolic: 180, diastolic: 120, temperature: 40, low_systolic: 90, yellow_systolic: 140, yellow_diastolic: 90, yellow_temperature: 38 }
test('priority queue includes automatic referrals and elevated manual referrals, excludes direct incidents', () => {
  assert.equal(isHighVitalReferral({ source: 'bhw', vitals: { bp: '180/80' } }, null), true)
  assert.equal(isHighVitalReferral({ source: 'bhw', vitals: { emergency_manual: true, temp: '40' } }, policy), true)
  assert.equal(isHighVitalReferral({ source: 'bhw', vitals: { emergency_manual: true, bp: '120/80' } }, policy), false)
  assert.equal(isHighVitalReferral({ source: 'direct', vitals: { temp: '40' } }, policy), false)
})
test('either BP component or temperature independently triggers referral including boundary', () => {
  assert.equal(triageReasons({ bp: '180/80' }, policy).length, 1)
  assert.equal(triageReasons({ bp: '120/120' }, policy).length, 1)
  assert.equal(triageReasons({ temp: '40' }, policy).length, 1)
  assert.equal(triageReasons({ bp: '181/121', temp: '40.1' }, policy).length, 2)
  assert.deepEqual(triageReasons({ bp: '139/89', temp: '37.9' }, policy), [])
})
test('three-level triage detects low BP and uses yellow priority for elevated readings', () => {
  assert.deepEqual(parseBloodPressure(' 88 / 60 '), { systolic: 88, diastolic: 60 })
  assert.equal(classifyTriage({ temp: '40', bp: '88/60' }, policy).level, 'red')
  assert.equal(classifyTriage({ temp: '38.5', bp: '120/80' }, policy).level, 'yellow')
  assert.equal(classifyTriage({ temp: '37', bp: '120/80' }, policy).level, 'green')
})
test('disabled policy and missing readings do not invent referrals', () => {
  assert.deepEqual(triageReasons({ bp: '200/120' }, null), [])
  assert.deepEqual(triageReasons({ bp: '200/120' }, { ...policy, enabled: false }), [])
  assert.deepEqual(triageReasons({ bp: 'abc', temp: '' }, policy), [])
  assert.equal(triageReasons({ bp: ' 180 / 80 ' }, policy).length, 1)
})
test('blank or null cutoffs do not turn normal vital signs red', () => {
  const incompletePolicy = {
    enabled: true,
    systolic: null,
    diastolic: '',
    temperature: null,
    low_systolic: undefined,
    yellow_systolic: null,
    yellow_diastolic: '',
    yellow_temperature: null,
  }
  assert.equal(classifyTriage({ bp: '120/80', temp: '37' }, incompletePolicy).level, 'green')
})
test('only the designated nurse gets the emergency home page', () => {
  assert.equal(isEmergencyNurse({ role: 'Nurse', email: 'ZULEIKA.JACOSALEM@healthtrack.com' }), true)
  assert.equal(isEmergencyNurse({ role: 'BHW', email: 'zuleika.jacosalem@healthtrack.com' }), false)
  assert.equal(isEmergencyNurse({ role: 'Nurse', email: 'other@healthtrack.com' }), false)
})
