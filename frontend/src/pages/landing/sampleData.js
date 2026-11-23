import { formatMoney } from '../../lib/money.js'

const money = (amount) => formatMoney({ amount })

// Sample times always read in West Africa Time, wherever the page is opened.
const WAT = new Intl.DateTimeFormat('en-NG', {
  timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
})
export const wat = (iso) => `${WAT.format(new Date(iso))} WAT`

// Sample times are relative to today so they never look stale.
const at = (days, hour, minute = 0) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export const INSPECTION_AT = at(1, 10)
export const QUOTE_UNTIL = at(3, 17)
export const REPAIR_FROM = at(5, 9)

export const HISTORY = [
  [at(-3, 9), 'You sent the request'],
  [at(-2, 11, 30), `Inspection booked, ${money(500000)} fee`],
  [at(-1, 10), 'Inspection done'],
  [at(0, 8, 45), `Quote sent, ${money(8500000)}`],
]

export const STAGE_ROWS = {
  Request: [
    ['Job', 'Blocked bathroom drain'],
    ['Artisan', 'Plumber, Ikeja'],
    ['Inspection time', wat(INSPECTION_AT)],
  ],
  Inspect: [
    ['Inspection time', wat(INSPECTION_AT)],
    ['Inspection fee', money(500000)],
  ],
  Quote: [
    ['Valid until', wat(QUOTE_UNTIL)],
  ],
  Repair: [
    ['Deposit (70%)', `${money(5950000)} recorded`],
    ['Repair window', wat(REPAIR_FROM)],
  ],
}

export const JOB = 'Leak under the kitchen sink'

// Rows of the sample request lists, seen by a homeowner: `detail` is the money that matters at
// this stage, `when` the next time on the job.
export const LIST_ROWS = [
  { name: JOB, avatar: '/avatars/artisan.svg', tone: 'clock', status: 'Quote sent', detail: `Quote ${money(8500000)}`, when: `Valid until ${wat(QUOTE_UNTIL)}` },
  { name: 'Sparking socket, master bedroom', avatar: '/avatars/artisan.svg', tone: 'booked', status: 'Inspection booked', detail: `Inspection fee ${money(500000)}`, when: `Visit ${wat(INSPECTION_AT)}` },
  { name: 'Bedroom door won’t latch', avatar: '/avatars/artisan.svg', tone: 'waiting', status: 'Waiting for artisan', detail: 'No fee yet', when: 'Reply due in 4 h' },
]
