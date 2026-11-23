import { formatMoney } from '../../../../lib/money.js'
const time = (iso) => new Date(iso).getTime()

export function validateQuote({ scope, total, start, end, expiresAt }, now = Date.now()) {
  const errors = {}
  const len = scope.trim().length
  if (len < 3 || len > 4000) errors.scope = 'Describe the work in 3 to 4000 characters'
  if (!(total >= 4)) errors.total = `Enter a total of at least ${formatMoney({ amount: 4 })}`
  if (!start) errors.start = 'Choose when the repair starts'
  else if (time(start) <= now) errors.start = 'The repair must start in the future'
  if (!end) errors.end = 'Choose when the repair ends'
  else if (start && time(end) <= time(start)) errors.end = 'The repair must end after it starts'
  if (!expiresAt) errors.expiresAt = 'Choose how long the quote stays valid'
  else if (time(expiresAt) <= now) errors.expiresAt = 'The quote must stay valid into the future'
  else if (start && time(expiresAt) > time(start)) errors.expiresAt = 'The quote must expire no later than the repair starts'
  return errors
}
