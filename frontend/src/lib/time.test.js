import {
  formatDateTime,
  formatRelative,
  formatTime,
  fromLocalInput,
  toLocalInput,
  toOffsetISO,
  zoneLabel,
} from './time'

// Copied from backend/src/validation/serviceRequests.js
const BACKEND_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/

describe('time', () => {
  it('toOffsetISO matches the backend regex and round-trips the instant', () => {
    const date = new Date(2027, 0, 12, 9, 0, 5)
    const iso = toOffsetISO(date)
    expect(iso).toMatch(BACKEND_TIMESTAMP)
    expect(new Date(iso).getTime()).toBe(date.getTime())
  })
  it('converts datetime-local values both ways', () => {
    const iso = fromLocalInput('2027-01-12T09:00')
    expect(iso).toMatch(BACKEND_TIMESTAMP)
    expect(iso).toContain('T09:00:00')
    expect(toLocalInput(iso)).toBe('2027-01-12T09:00')
    expect(fromLocalInput('')).toBe('')
    expect(toLocalInput('nope')).toBe('')
  })
  it('labels the zone', () => {
    expect(zoneLabel()).toMatch(/^.+, UTC[+-]\d{2}:\d{2}$/)
  })
  it('includes the zone abbreviation in formatted times', () => {
    const abbr = zoneLabel().split(',')[0]
    expect(formatDateTime('2027-01-12T09:00:00+01:00').endsWith(abbr)).toBe(true)
    expect(formatTime('2027-01-12T09:00:00+01:00').endsWith(abbr)).toBe(true)
  })
  it('formats relative time', () => {
    const now = new Date('2027-01-12T09:00:00Z')
    const at = (ms) => new Date(now.getTime() + ms)
    expect(formatRelative(at(22 * 60000), now)).toBe('in 22 min')
    expect(formatRelative(at(3 * 3600000), now)).toBe('in 3 h')
    expect(formatRelative(at(2 * 86400000), now)).toBe('in 2 days')
    expect(formatRelative(at(-22 * 60000), now)).toBe('22 min ago')
  })
})
