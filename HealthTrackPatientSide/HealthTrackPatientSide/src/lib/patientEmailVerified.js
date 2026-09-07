/** True when the patient may use the portal (phone/username, confirmed email, or Google). */
export function isPatientEmailVerified(user) {
  if (!user) return false
  const meta = user.user_metadata ?? {}
  if (meta.auth_mode === 'phone_username') return true
  if (meta.portal_username) return true
  const email = (user.email ?? '').toString().toLowerCase()
  if (email.endsWith('@patient.healthtrack.local')) return true
  if (user.email_confirmed_at) return true
  if (meta.email_verified === true || meta.email_verified === 'true') return true
  const appMeta = user.app_metadata ?? {}
  const provider = (appMeta.provider ?? '').toString().toLowerCase()
  const providers = Array.isArray(appMeta.providers) ? appMeta.providers : []
  if (provider === 'google' || providers.includes('google')) return true
  return false
}
