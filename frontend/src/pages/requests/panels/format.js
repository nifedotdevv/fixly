import { formatDateTime, formatTime, zoneLabel } from '../../../lib/time.js'

export const FALLBACK_NAME = 'Former Fixly user'

export const personOf = (view, side) => {
  const person = view.participants?.[side]
  return { name: person?.name || FALLBACK_NAME, avatar: person?.avatar?.url }
}

export const otherSide = (role) => (role === 'artisan' ? 'homeowner' : 'artisan')

export const moneyIn = (amount, currency = 'NGN') => ({ amount, currency })

export function windowText(window) {
  const start = new Date(window.start)
  const sameDay = new Date(window.end).toDateString() === start.toDateString()
  return `${formatDateTime(window.start)} to ${sameDay ? formatTime(window.end) : formatDateTime(window.end)}`
}

export const windowZone = (window) => zoneLabel(new Date(window.start))
