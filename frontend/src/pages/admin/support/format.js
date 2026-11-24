export const PURPOSE = { inspection: 'Inspection fee', repair_deposit: 'Repair deposit', repair_balance: 'Repair balance' }
export const PAGE_SIZE = 20

export const pageOf = (sp) => Math.max(1, Number.parseInt(sp.get('page') ?? '', 10) || 1)

export function excerpt(text, max = 90) {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat
}


// How long a Paystack payment may wait for its automatic refund to start before an admin is asked to look.
const REFUND_START_GRACE_MS = 30 * 60000
const isPaystack = (payment) => typeof payment._id === 'string' && payment._id.startsWith('paystack:')

// What the automatic refund is doing for one queued payment, and whether an admin has to act.
//   label    short status for the Refund column
//   detail   optional explanation (Paystack's reason when it failed)
//   tone     info | warning | error | neutral
//   needsYou true when only a person can finish it, so Resolve is offered
export function refundStatus(payment, now = Date.now()) {
  const refund = payment.refund
  if (refund?.state === 'requesting') return { label: 'Refunding automatically', tone: 'info', needsYou: false }
  if (refund?.state === 'pending') return { label: 'Refund sent, waiting for Paystack', tone: 'info', needsYou: false }
  if (refund?.state === 'processed') return { label: 'Refunded', tone: 'neutral', needsYou: false }
  if (refund?.state === 'failed') return { label: 'Refund failed', detail: refund.failureReason, tone: 'error', needsYou: true }
  if (refund?.state === 'needs_attention') return { label: 'Needs attention', detail: refund.failureReason, tone: 'warning', needsYou: true }
  if (!isPaystack(payment)) return { label: 'Not refunded automatically', tone: 'neutral', needsYou: true }
  if (now - new Date(payment.createdAt).getTime() < REFUND_START_GRACE_MS) {
    return { label: 'Refund starting', tone: 'info', needsYou: false }
  }
  return { label: 'Refund didn’t start', detail: 'No automatic refund began. Check the payment in Paystack.', tone: 'warning', needsYou: true }
}

// Payments a person must handle first; otherwise the server's newest-first order is kept.
export const byNeedsYou = (rows, now = Date.now()) => rows
  .map((row, index) => ({ row, index, first: refundStatus(row, now).needsYou ? 0 : 1 }))
  .sort((a, b) => a.first - b.first || a.index - b.index)
  .map(({ row }) => row)
