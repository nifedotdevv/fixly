// Mirrors the backend password schema (backend/src/validation/credentials.js).
const byteLength = (s) => new TextEncoder().encode(s).length

export const RULES = [
  { id: 'length', label: '10 or more characters', ok: (p) => p.length >= 10 },
  { id: 'upper', label: 'An uppercase letter', ok: (p) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'A lowercase letter', ok: (p) => /[a-z]/.test(p) },
  { id: 'digit', label: 'A number', ok: (p) => /[0-9]/.test(p) },
  { id: 'bytes', label: '72 bytes or fewer', ok: (p) => p.length <= 100 && byteLength(p) <= 72 },
]

export const passwordValid = (p) => RULES.every((r) => r.ok(p))
