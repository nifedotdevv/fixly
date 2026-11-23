const pad = (n) => String(n).padStart(2, '0')

function offsetString(date) {
  const minutes = -date.getTimezoneOffset()
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

function abbreviation(date) {
  const part = new Intl.DateTimeFormat('en-NG', { timeZoneName: 'short' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName')
  return part ? part.value : ''
}

export function zoneLabel(date = new Date()) {
  return `${abbreviation(date)}, UTC${offsetString(date)}`
}

function localParts(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// e.g. 2027-01-12T09:00:00+01:00, which satisfies the backend timestamp regex.
export function toOffsetISO(date) {
  return `${localParts(date)}:${pad(date.getSeconds())}${offsetString(date)}`
}

export function fromLocalInput(value) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : toOffsetISO(date)
}

export function toLocalInput(iso) {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : localParts(date)
}

export function formatDateTime(iso) {
  const date = new Date(iso)
  const text = new Intl.DateTimeFormat('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
  return `${text} ${abbreviation(date)}`
}

export function formatTime(iso) {
  const date = new Date(iso)
  const text = new Intl.DateTimeFormat('en-NG', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
  return `${text} ${abbreviation(date)}`
}

export function formatRelative(target, now = new Date()) {
  const diff = new Date(target).getTime() - new Date(now).getTime()
  const minutes = Math.max(1, Math.round(Math.abs(diff) / 60000))
  let text
  if (minutes < 60) text = `${minutes} min`
  else if (minutes < 1440) text = `${Math.round(minutes / 60)} h`
  else {
    const days = Math.round(minutes / 1440)
    text = `${days} ${days === 1 ? 'day' : 'days'}`
  }
  return diff >= 0 ? `in ${text}` : `${text} ago`
}
