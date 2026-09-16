export function emergencyStatus(request) {
  if (!request?.intake_data?.emergency_referred) return null
  const status = request.intake_data.emergency_status || 'pending'
  const messages = {
    pending: ['Referred to Nurse Zuleika', 'Please proceed directly to Nurse Zuleika for assessment. No regular queue number is needed.'],
    in_care: ['Consultation in progress', 'Nurse Zuleika is attending to your emergency consultation. No regular queue number is needed.'],
    completed: ['Consultation completed', 'Your consultation with Nurse Zuleika is complete. Follow the care instructions given to you.'],
    referred: ['Referred / transferred', 'Nurse Zuleika has referred or transferred your case. Follow the referral instructions given to you.'],
  }
  const [title, message] = messages[status] || messages.pending
  return { title, message, active: !['completed', 'referred'].includes(status) }
}
