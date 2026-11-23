import { ApiError } from '../../../lib/api.js'

export const ROLE_LABELS = { house_owner: 'Homeowner', artisan: 'Artisan', admin: 'Admin' }
export const roleLabel = (role) => ROLE_LABELS[role] ?? role

export const userId = (u) => u.id ?? u._id
export const fullName = (u) => [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Former Fixly user'

// The backend leaves emailVerified unset on legacy accounts, which counts as verified.
export const isVerified = (u) => u.emailVerified !== false

// The API only guarantees isDeleted; deletionReason appears if a future response includes it.
export function statusLabel(u) {
  if (!u.isDeleted) return 'Active'
  if (u.deletionReason === 'self') return 'Deactivated (self)'
  if (u.deletionReason === 'admin') return 'Deactivated (admin)'
  return 'Deactivated'
}

export const formatDate = (iso) =>
  iso ? new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : ''

const PHOTO_PENDING = 'Photo cleanup is still finishing. Try again in a moment.'

// Turns a failed admin mutation into the line shown in the dialog or form.
export function mutationMessage(err, { role = false } = {}) {
  if (!(err instanceof ApiError)) return 'Something went wrong. Try again.'
  if (err.status === 503) return PHOTO_PENDING
  if (err.status === 409) {
    if (err.code === 'LAST_ADMIN') return 'Fixly needs at least one active admin.'
    if (role && /artisan profile/i.test(err.message)) return 'Accounts with an artisan profile must stay artisans.'
    if (role && /booking obligations|service requests/i.test(err.message)) return 'This account has open jobs.'
  }
  return err.message
}
