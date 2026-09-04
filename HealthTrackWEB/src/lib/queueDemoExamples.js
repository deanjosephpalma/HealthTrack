import { compareByPriorityThenArrival } from '../lib/patientPriority'

/**
 * Demo lineup shaped like real Encode Desk / Queue rows.
 * Preview only — not written to the database.
 */

const BASE = new Date()
BASE.setHours(8, 0, 0, 0)

function at(minutesAfter) {
  return new Date(BASE.getTime() + minutesAfter * 60_000).toISOString()
}

function splitName(full) {
  const parts = String(full || '')
    .trim()
    .split(/\s+/)
  if (parts.length <= 1) return { first_name: full || '', last_name: '' }
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
}

/** Encode Desk cards (same shape as service_requests list). */
export const ENCODE_DESK_DEMO_ROWS = [
  {
    id: 'demo-enc-1',
    _demo: true,
    status: 'Awaiting Encoding',
    created_at: at(0),
    reference_number: 'DEMO-ENC-001',
    intake_data: {
      line_joined_at: at(0),
      is_priority: false,
      is_senior: false,
      is_pwd: false,
      priority_labels: [],
    },
    patients: { ...splitName('Juan Dela Cruz'), name: 'Juan Dela Cruz', barangay: 'Aplaya' },
    service_types: { name: 'Outpatient Consultation', queue_prefix: 'OPD' },
  },
  {
    id: 'demo-enc-2',
    _demo: true,
    status: 'Awaiting Encoding',
    created_at: at(5),
    reference_number: 'DEMO-ENC-002',
    intake_data: {
      line_joined_at: at(5),
      is_priority: false,
      is_senior: false,
      is_pwd: false,
      priority_labels: [],
    },
    patients: { ...splitName('Maria Santos'), name: 'Maria Santos', barangay: 'San Antonio' },
    service_types: { name: 'Animal Bite', queue_prefix: 'AB' },
  },
  {
    id: 'demo-enc-3',
    _demo: true,
    status: 'Awaiting Encoding',
    created_at: at(10),
    reference_number: 'DEMO-ENC-003',
    intake_data: {
      line_joined_at: at(10),
      is_priority: true,
      is_senior: true,
      is_pwd: false,
      priority_labels: ['Senior'],
    },
    patients: {
      ...splitName('Rosa Reyes'),
      name: 'Rosa Reyes',
      barangay: 'Labuin',
      birthdate: '1958-03-12',
    },
    service_types: { name: 'Outpatient Consultation', queue_prefix: 'OPD' },
  },
  {
    id: 'demo-enc-4',
    _demo: true,
    status: 'Awaiting Encoding',
    created_at: at(15),
    reference_number: 'DEMO-ENC-004',
    intake_data: {
      line_joined_at: at(15),
      is_priority: true,
      is_senior: false,
      is_pwd: true,
      priority_labels: ['PWD'],
      staff_encode: { disability: 'Visual Disability' },
    },
    patients: {
      ...splitName('Pedro Garcia'),
      name: 'Pedro Garcia',
      barangay: 'San Miguel',
      disability: 'Visual Disability',
    },
    service_types: { name: 'Medical Certificate', queue_prefix: 'MC' },
  },
  {
    id: 'demo-enc-5',
    _demo: true,
    status: 'Awaiting Encoding',
    created_at: at(20),
    reference_number: 'DEMO-ENC-005',
    intake_data: {
      line_joined_at: at(20),
      is_priority: false,
      is_senior: false,
      is_pwd: false,
      priority_labels: [],
    },
    patients: { ...splitName('Ana Lopez'), name: 'Ana Lopez', barangay: 'Linga' },
    service_types: { name: 'Tuberculosis Treatment Services', queue_prefix: 'TB' },
  },
].slice().sort((a, b) =>
  compareByPriorityThenArrival(
    {
      is_priority: a.intake_data?.is_priority,
      line_joined_at: a.intake_data?.line_joined_at,
      created_at: a.created_at,
      intake_data: a.intake_data,
    },
    {
      is_priority: b.intake_data?.is_priority,
      line_joined_at: b.intake_data?.line_joined_at,
      created_at: b.created_at,
      intake_data: b.intake_data,
    },
  ),
)

/** Queue / Doctor Consult tickets (same shape as local/remote queue rows). */
export const QUEUE_DEMO_ROWS = [
  {
    id: 'demo-q-1',
    _demo: true,
    patient_name: 'Juan Dela Cruz',
    service_code: 'OPD',
    queue_number: 1,
    reason: 'Fever / cough',
    status: 'waiting',
    created_at: at(25),
    is_priority: false,
    priority_labels: null,
    counter_room: 'Counter 1',
    estimated_waiting_time: 15,
    synced: 1,
  },
  {
    id: 'demo-q-2',
    _demo: true,
    patient_name: 'Maria Santos',
    service_code: 'AB',
    queue_number: 1,
    reason: 'Dog bite — Day 0',
    status: 'waiting',
    created_at: at(30),
    is_priority: false,
    priority_labels: null,
    counter_room: 'Counter 1',
    estimated_waiting_time: 20,
    synced: 1,
  },
  {
    id: 'demo-q-3',
    _demo: true,
    patient_name: 'Rosa Reyes',
    service_code: 'OPD',
    queue_number: 2,
    reason: 'Follow-up consult',
    status: 'waiting',
    created_at: at(35),
    is_priority: true,
    priority_labels: 'Senior',
    counter_room: 'Counter 1',
    estimated_waiting_time: 10,
    synced: 1,
  },
  {
    id: 'demo-q-4',
    _demo: true,
    patient_name: 'Pedro Garcia',
    service_code: 'MC',
    queue_number: 1,
    reason: 'MedCert — employment',
    status: 'next',
    created_at: at(40),
    is_priority: true,
    priority_labels: 'PWD',
    counter_room: 'Counter 2',
    estimated_waiting_time: 8,
    synced: 1,
  },
  {
    id: 'demo-q-5',
    _demo: true,
    patient_name: 'Ana Lopez',
    service_code: 'TB',
    queue_number: 1,
    reason: 'TB medicine release',
    status: 'waiting',
    created_at: at(45),
    is_priority: false,
    priority_labels: null,
    counter_room: 'Counter 1',
    estimated_waiting_time: 25,
    synced: 1,
  },
].slice().sort(compareByPriorityThenArrival)

export function isDemoQueueRow(row) {
  return Boolean(row?._demo) || String(row?.id || '').startsWith('demo-')
}

/** Line order badge: first = Next, everyone else = Waiting. */
export function linePositionLabel(index) {
  const n = Number(index)
  if (!Number.isFinite(n) || n < 0) return ''
  return n === 0 ? 'Next' : 'Waiting'
}
