import {
  Ban,
  CalendarCheck,
  CircleCheck,
  CircleSlash,
  Clock,
  Hammer,
  Hourglass,
  LifeBuoy,
  Search,
  TimerOff,
  TriangleAlert,
} from 'lucide-react'

// Mirrors backend/src/constants/serviceRequests.js.
export const REQUEST_STATUSES = [
  'pending',
  'rejected',
  'response_expired',
  'cancelled',
  'awaiting_inspection_payment',
  'inspection_payment_expired',
  'inspection_confirmed',
  'inspection_completed',
  'quote_submitted',
  'quote_expired',
  'repair_not_proceeding',
  'awaiting_repair_deposit',
  'repair_payment_expired',
  'repair_confirmed',
  'repair_in_progress',
  'awaiting_homeowner_confirmation',
  'problem_reported',
  'awaiting_final_payment',
  'completed',
  'support_closed',
]

export const RESOLVED = [
  'rejected',
  'response_expired',
  'cancelled',
  'inspection_payment_expired',
  'quote_expired',
  'repair_not_proceeding',
  'repair_payment_expired',
  'completed',
  'support_closed',
]

export const MILESTONES = [
  'Requested',
  'Inspection booked',
  'Inspected',
  'Quoted',
  'Repair booked',
  'Repair done',
  'Settled',
]

// milestone = index in MILESTONES the request has reached (ended statuses: the furthest it got).
// cancelled depends on when it was cancelled; see milestoneFor.
const META = {
  pending: ['Waiting for artisan', 'waiting', Hourglass, 0],
  rejected: ['Declined', 'ended', Ban, 0],
  response_expired: ['No reply in time', 'ended', TimerOff, 0],
  cancelled: ['Cancelled', 'ended', CircleSlash, 0],
  awaiting_inspection_payment: ['Inspection fee due', 'clock', Clock, 0],
  inspection_payment_expired: ['Inspection fee not paid in time', 'ended', TimerOff, 0],
  inspection_confirmed: ['Inspection booked', 'booked', CalendarCheck, 1],
  inspection_completed: ['Inspected, quote coming', 'waiting', Search, 2],
  quote_submitted: ['Quote ready', 'clock', Clock, 3],
  quote_expired: ['Quote expired', 'ended', TimerOff, 3],
  repair_not_proceeding: ['Repair not going ahead', 'ended', Ban, 3],
  awaiting_repair_deposit: ['Deposit due', 'clock', Clock, 3],
  repair_payment_expired: ['Deposit not paid in time', 'ended', TimerOff, 3],
  repair_confirmed: ['Repair booked', 'booked', CalendarCheck, 4],
  repair_in_progress: ['Repair under way', 'working', Hammer, 4],
  awaiting_homeowner_confirmation: ['Check the repair', 'working', Hammer, 5],
  problem_reported: ['Support reviewing', 'attention', TriangleAlert, 5],
  awaiting_final_payment: ['Balance due', 'clock', Clock, 5],
  completed: ['Completed', 'done', CircleCheck, 6],
  support_closed: ['Closed by support', 'ended', LifeBuoy, 5],
}

export function statusMeta(status) {
  const entry = META[status]
  if (!entry) return { label: status, tone: 'ended', icon: Ban, milestone: 0 }
  const [label, tone, icon, milestone] = entry
  return { label, tone, icon, milestone }
}

// A cancel can happen before or after a quote exists (deposit stage).
export function milestoneFor(view) {
  if (view.status === 'cancelled' && view.quote) return 3
  return statusMeta(view.status).milestone
}

const isHomeowner = (role) => role === 'homeowner' || role === 'house_owner'
const time = (iso) => new Date(iso).getTime()
const PAYMENT_WAITING = ['awaiting_inspection_payment', 'awaiting_repair_deposit', 'awaiting_final_payment']

export const isPaymentWaiting = (status) => PAYMENT_WAITING.includes(status)

export function deadlineFor(view) {
  switch (view.status) {
    case 'pending':
      return view.responseDeadline ?? null
    case 'awaiting_inspection_payment':
      return view.inspection?.paymentDeadline ?? null
    case 'quote_submitted':
      return view.quote?.expiresAt ?? null
    case 'awaiting_repair_deposit':
      return view.repair?.paymentDeadline ?? null
    default:
      return null
  }
}

const action = (id, label, path, bodyFields = [], extra = {}) => ({
  id,
  label,
  endpoint: path,
  method: 'POST',
  bodyFields,
  ...extra,
})

// Endpoints are relative to /api/v1. Follows backend/src/services/requests/serviceRequests.js.
// Spec/backend differences: none in who may act at which status; the confirm flags below are
// UI-only (the backend has no confirmation step), taken from the §4 spec.
export function actionsFor(view, role, now = new Date()) {
  const base = `/service-requests/${view.id}`
  const homeowner = isHomeowner(role)
  const at = now instanceof Date ? now.getTime() : time(now)

  if (homeowner) {
    switch (view.status) {
      case 'pending':
        return [
          action('add-note', 'Add note', `${base}/notes`, ['text']),
          action('cancel', 'Cancel request', `${base}/cancel`),
        ]
      case 'awaiting_inspection_payment':
        return [action('cancel', 'Cancel request', `${base}/cancel`)]
      case 'quote_submitted':
        return [
          action('approve-quote', 'Approve quote', `${base}/quote/approve`),
          action('decline-quote', 'Decline quote', `${base}/quote/decline`, [], { confirm: true }),
        ]
      case 'awaiting_repair_deposit':
        return [
          action('cancel', 'Cancel request', `${base}/cancel`, [], {
            confirm: 'The inspection stays recorded. Nothing is refunded by Fixly.',
          }),
        ]
      case 'awaiting_homeowner_confirmation':
        return [
          action('confirm-completion', 'Confirm repair is finished', `${base}/completion/confirm`, [], {
            confirm: true,
          }),
          action('report-problem', 'Report a problem', `${base}/problems`, ['explanation']),
        ]
      case 'completed':
        return view.review ? [] : [action('review', 'Leave a review', `${base}/review`, ['rating', 'comment'])]
      default:
        return []
    }
  }

  switch (view.status) {
    case 'pending':
      return [
        action('accept', 'Accept with inspection fee', `${base}/accept`, ['inspectionFee']),
        action('reject', 'Decline with reason', `${base}/reject`, ['reason']),
      ]
    case 'inspection_confirmed': {
      const end = view.inspection?.window?.end
      return [
        action('complete-inspection', 'Mark inspection done', `${base}/inspection/complete`, [], {
          ...(end && at < time(end) ? { availableFrom: end } : {}),
        }),
      ]
    }
    case 'inspection_completed':
      return [
        action('submit-quote', 'Send quote', `${base}/quote`, ['scope', 'total', 'repairWindow', 'expiresAt']),
      ]
    case 'repair_confirmed': {
      const start = view.repair?.window?.start
      return [
        action('start-repair', 'Start repair', `${base}/repair/start`, [], {
          ...(start && at < time(start) ? { availableFrom: start } : {}),
        }),
      ]
    }
    case 'repair_in_progress':
      return [action('complete-repair', 'Report repair finished', `${base}/repair/complete`, [], { confirm: true })]
    default:
      return []
  }
}

export function turnGroup(view, role, now = new Date()) {
  const { status } = view
  const at = now instanceof Date ? now.getTime() : time(now)
  if (isHomeowner(role)) {
    if (
      status === 'quote_submitted' ||
      status === 'awaiting_homeowner_confirmation' ||
      (status === 'completed' && !view.review)
    ) {
      return 'needs-you'
    }
  } else if (
    status === 'pending' ||
    status === 'inspection_completed' ||
    status === 'repair_in_progress' ||
    (status === 'inspection_confirmed' && view.inspection?.window?.end && at >= time(view.inspection.window.end)) ||
    (status === 'repair_confirmed' && view.repair?.window?.start && at >= time(view.repair.window.start))
  ) {
    return 'needs-you'
  }
  return RESOLVED.includes(status) ? 'finished' : 'waiting'
}
