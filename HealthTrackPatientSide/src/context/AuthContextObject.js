import { createContext } from 'react'

export const AuthContext = createContext(null)

export const buildPatient = (user) => {
  if (!user) return null
  const meta = user.user_metadata ?? {}
  const firstName = (meta.first_name ?? '').toString().trim()
  const lastName = (meta.last_name ?? '').toString().trim()
  const phone = (meta.phone ?? '').toString().trim()
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
  return {
    id: user.id,
    email: user.email ?? '',
    firstName,
    lastName,
    phone,
    portal_username: (meta.portal_username ?? '').toString().trim() || null,
    name: fullName || meta.portal_username || user.email || 'Patient',
  }
}

