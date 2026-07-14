export function buildAppointmentInsertPayload({
  patientAuthId,
  patientName,
  dateValue,
  timeValue,
  reason,
  patient_email,
  phone_number,
  sms_consent,
  serviceId,
  serviceRequestId,
}) {
  const date = (dateValue ?? '').toString().trim()
  const time = (timeValue ?? '').toString().trim()
  
  return {
    appointment: {
      patient_auth_id: patientAuthId,
      patient_name: patientName,
      appointment_date: date,
      preferred_schedule: time || null,
      status: 'scheduled',
      reason: (reason ?? '').toString().trim(),
      patient_email: patient_email || null,
      phone_number: phone_number || null,
      sms_consent: Boolean(sms_consent),
      service_type_id: serviceId || null,
    },
    serviceRequestId
  }
}

export async function insertPatientAppointment(supabase, payload) {
  // 1. Insert Appointment
  const { data: appointment, error: apptError } = await supabase
    .from('appointments')
    .insert([payload.appointment])
    .select()
    .single()
    
  if (apptError) {
    return { error: apptError }
  }

  // 2. Link Appointment to Service Request
  if (payload.serviceRequestId) {
    const { error: srError } = await supabase
      .from('service_requests')
      .update({
        appointment_id: appointment.id,
        status: 'Appointment Pending', // Final confirmation
        updated_at: new Date().toISOString()
      })
      .eq('id', payload.serviceRequestId)
      
    if (srError) {
      console.error('Failed to link appointment to service request:', srError)
      // Even if linking fails, the appointment is created. We can still return success,
      // but ideally we'd want this to be an RPC transaction. For now it's okay.
    }
  }

  return { error: null, appointment }
}
