const ALIASES = {
  house_owner: 'house_owner',
  homeowner: 'house_owner',
  'house owner': 'house_owner',
  artisan: 'artisan',
  admin: 'admin',
}

export const normalizeRole = (role) => ALIASES[String(role ?? '').toLowerCase()] ?? 'house_owner'

export const normalizeUser = (user) => (user ? { ...user, role: normalizeRole(user.role) } : null)

export const ROLE_AUDIENCE = {
  house_owner: 'homeowners',
  artisan: 'artisans',
  admin: 'admins',
}

// Only same-origin paths are allowed as a post-login destination.
export const safeNext = (next) => (next && next.startsWith('/') && !next.startsWith('//') ? next : null)
