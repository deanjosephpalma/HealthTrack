export const PILA_BARANGAYS = ['Aplaya', 'Bagong Pook', 'Bukal', 'Bulilan Norte', 'Bulilan Sur', 'Concepcion', 'Labuin', 'Linga', 'Masico', 'Pansol', 'Pinagbayanan', 'San Antonio', 'San Miguel', 'Santa Clara Norte', 'Santa Clara Sur', 'Tubuan', 'Victoria']
export const EMPTY_EMERGENCY_INTAKE = {
  patient_name: '', reason: '', mobile_phone: '', age: '', sex: '', barangay: '',
  municipality: 'Pila', province: 'Laguna', bp: '', temp: '', pr_hr: '', rr: '', spo2: '', wt: '', ht: '', notes: '',
}
export function patientEmergencyIntake(patient) {
  let age = ''
  if (patient.birthdate) {
    const birth = new Date(`${patient.birthdate}T00:00:00`)
    const today = new Date()
    if (!Number.isNaN(birth.getTime())) age = today.getFullYear() - birth.getFullYear() - (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate()) ? 1 : 0)
  }
  return {
    ...EMPTY_EMERGENCY_INTAKE, patient_name: patient.name || '', age: String(age), sex: patient.sex || '',
    mobile_phone: patient.mobile_phone || patient.phone || '', barangay: patient.barangay || '',
    municipality: patient.municipality || 'Pila', province: patient.province || 'Laguna',
  }
}
