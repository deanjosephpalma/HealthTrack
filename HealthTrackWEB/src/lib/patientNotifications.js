import { supabase } from './supabaseClient'

/** Create a persistent Patient Portal alert. Fails quietly so clinic work is never blocked by a notification error. */
export async function notifyPatient({ patientId, title, message, type = 'update', queueId = null, serviceRequestId = null }) {
  if (!patientId) return null
  const { data, error } = await supabase.rpc('create_patient_notification', {
    p_patient_id: patientId,
    p_title: title,
    p_message: message,
    p_notification_type: type,
    p_queue_id: queueId,
    p_service_request_id: serviceRequestId,
  })
  if (error) {
    console.warn('[patient-notifications] Could not create notification:', error.message)
    return null
  }
  return data
}
