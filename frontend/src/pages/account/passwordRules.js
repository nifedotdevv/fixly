// Mirrors the backend password schema (backend/src/validation/credentials.js).
const byteLength = (s) => new TextEncoder().encode(s).length

// `limit` rules are upper bounds almost nobody reaches (bcrypt reads at most 72 bytes), so the
// checklist shows them only once they fail, with plain wording instead of "bytes".
export const RULES = [
  { id: 'length', label: '10 or more characters', ok: (p) => p.length >= 10 },
  { id: 'upper', label: 'An uppercase letter', ok: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'A lowercase letter', ok: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'A number', ok: (p) => /[0-9]/.test(p) },
  { id: 'max', label: 'Too long, use a shorter password', limit: true, ok: (p) => p.length <= 100 && byteLength(p) <= 72 },
]

export const passwordValid = (p) => RULES.every((r) => r.ok(p))
