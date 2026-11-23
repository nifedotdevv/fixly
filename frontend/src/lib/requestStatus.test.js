import {
  MILESTONES,
  REQUEST_STATUSES,
  RESOLVED,
  actionsFor,
  deadlineFor,
  isPaymentWaiting,
  milestoneFor,
  statusMeta,
  turnGroup,
} from './requestStatus'

const NOW = new Date('2027-01-12T09:00:00Z')
const past = '2027-01-12T08:00:00Z'
const future = '2027-01-12T12:00:00Z'
const v = (status, extra = {}) => ({ id: 'abc', status, ...extra })
const ids = (view, role, now = NOW) => actionsFor(view, role, now).map((a) => a.id)

// status -> [homeowner action ids, artisan action ids]
const EXPECTED = {
  pending: [['add-note', 'cancel'], ['accept', 'reject']],
  rejected: [[], []],
  response_expired: [[], []],
  cancelled: [[], []],
  awaiting_inspection_payment: [['cancel'], []],
  inspection_payment_expired: [[], []],
  inspection_confirmed: [[], ['complete-inspection']],
  inspection_completed: [[], ['submit-quote']],
  quote_submitted: [['approve-quote', 'decline-quote'], []],
  quote_expired: [[], []],
  repair_not_proceeding: [[], []],
  awaiting_repair_deposit: [['cancel'], []],
  repair_payment_expired: [[], []],
  repair_confirmed: [[], ['start-repair']],
  repair_in_progress: [[], ['complete-repair']],
  awaiting_homeowner_confirmation: [['confirm-completion', 'report-problem'], []],
  problem_reported: [[], []],
  awaiting_final_payment: [[], []],
  completed: [['review'], []],
  support_closed: [[], []],
}

describe('statuses', () => {
  it('has 20 statuses, all with meta', () => {
    expect(REQUEST_STATUSES).toHaveLength(20)
    for (const s of REQUEST_STATUSES) {
      const m = statusMeta(s)
      expect(m.label).toBeTruthy()
      expect(m.tone).toBeTruthy()
      expect(m.icon).toBeTruthy()
      expect(m.milestone).toBeGreaterThanOrEqual(0)
      expect(m.milestone).toBeLessThan(MILESTONES.length)
    }
    expect(MILESTONES).toHaveLength(7)
    expect(RESOLVED).toHaveLength(9)
  })
  it('matches the tone table', () => {
    expect(statusMeta('pending').tone).toBe('waiting')
    expect(statusMeta('quote_submitted').tone).toBe('clock')
    expect(statusMeta('repair_confirmed').tone).toBe('booked')
    expect(statusMeta('awaiting_homeowner_confirmation').tone).toBe('working')
    expect(statusMeta('problem_reported').tone).toBe('attention')
    expect(statusMeta('completed').tone).toBe('done')
    expect(statusMeta('support_closed').tone).toBe('ended')
    expect(statusMeta('quote_submitted').label).toBe('Quote ready')
  })
  it('records the furthest milestone, including for cancelled', () => {
    expect(milestoneFor(v('cancelled'))).toBe(0)
    expect(milestoneFor(v('cancelled', { quote: { total: 1 } }))).toBe(3)
    expect(statusMeta('quote_expired').milestone).toBe(3)
  })
})

describe('actionsFor', () => {
  for (const status of REQUEST_STATUSES) {
    it(`${status}: homeowner and artisan`, () => {
      const [h, a] = EXPECTED[status]
      expect(ids(v(status), 'homeowner')).toEqual(h)
      expect(ids(v(status), 'artisan')).toEqual(a)
    })
  }
  it('has no review action once reviewed', () => {
    expect(ids(v('completed', { review: { rating: 5 } }), 'homeowner')).toEqual([])
  })
  it('describes endpoints and bodies', () => {
    const [accept] = actionsFor(v('pending'), 'artisan', NOW)
    expect(accept).toMatchObject({
      endpoint: '/service-requests/abc/accept',
      method: 'POST',
      bodyFields: ['inspectionFee'],
    })
    const cancel = actionsFor(v('awaiting_repair_deposit'), 'homeowner', NOW)[0]
    expect(cancel.confirm).toMatch(/Nothing is refunded/)
    expect(actionsFor(v('quote_submitted'), 'homeowner', NOW)[1].confirm).toBe(true)
  })
  it('gates inspection complete on window end', () => {
    const view = v('inspection_confirmed', { inspection: { window: { start: past, end: future } } })
    expect(actionsFor(view, 'artisan', NOW)[0].availableFrom).toBe(future)
    const ended = v('inspection_confirmed', { inspection: { window: { start: past, end: past } } })
    expect(actionsFor(ended, 'artisan', NOW)[0].availableFrom).toBeUndefined()
  })
  it('gates repair start on window start', () => {
    const view = v('repair_confirmed', { repair: { window: { start: future, end: future } } })
    expect(actionsFor(view, 'artisan', NOW)[0].availableFrom).toBe(future)
    const started = v('repair_confirmed', { repair: { window: { start: past, end: future } } })
    expect(actionsFor(started, 'artisan', NOW)[0].availableFrom).toBeUndefined()
  })
})

describe('turnGroup', () => {
  it('homeowner needs-you', () => {
    expect(turnGroup(v('quote_submitted'), 'homeowner', NOW)).toBe('needs-you')
    expect(turnGroup(v('awaiting_homeowner_confirmation'), 'homeowner', NOW)).toBe('needs-you')
    expect(turnGroup(v('completed'), 'homeowner', NOW)).toBe('needs-you')
    expect(turnGroup(v('completed', { review: { rating: 4 } }), 'homeowner', NOW)).toBe('finished')
    expect(turnGroup(v('pending'), 'homeowner', NOW)).toBe('waiting')
  })
  it('artisan needs-you', () => {
    for (const s of ['pending', 'inspection_completed', 'repair_in_progress']) {
      expect(turnGroup(v(s), 'artisan', NOW)).toBe('needs-you')
    }
    const open = v('inspection_confirmed', { inspection: { window: { start: past, end: future } } })
    const done = v('inspection_confirmed', { inspection: { window: { start: past, end: past } } })
    expect(turnGroup(open, 'artisan', NOW)).toBe('waiting')
    expect(turnGroup(done, 'artisan', NOW)).toBe('needs-you')
    const notStarted = v('repair_confirmed', { repair: { window: { start: future, end: future } } })
    const started = v('repair_confirmed', { repair: { window: { start: past, end: future } } })
    expect(turnGroup(notStarted, 'artisan', NOW)).toBe('waiting')
    expect(turnGroup(started, 'artisan', NOW)).toBe('needs-you')
    expect(turnGroup(v('completed'), 'artisan', NOW)).toBe('finished')
    expect(turnGroup(v('quote_submitted'), 'artisan', NOW)).toBe('waiting')
  })
  it('resolved statuses are finished', () => {
    for (const s of RESOLVED.filter((x) => x !== 'completed')) {
      expect(turnGroup(v(s), 'homeowner', NOW)).toBe('finished')
      expect(turnGroup(v(s), 'artisan', NOW)).toBe('finished')
    }
  })
})

describe('payment and deadlines', () => {
  it('flags payment-waiting statuses', () => {
    expect(isPaymentWaiting('awaiting_final_payment')).toBe(true)
    expect(isPaymentWaiting('pending')).toBe(false)
  })
  it('returns the running deadline', () => {
    expect(deadlineFor(v('pending', { responseDeadline: 'a' }))).toBe('a')
    expect(deadlineFor(v('awaiting_inspection_payment', { inspection: { paymentDeadline: 'b' } }))).toBe('b')
    expect(deadlineFor(v('quote_submitted', { quote: { expiresAt: 'c' } }))).toBe('c')
    expect(deadlineFor(v('awaiting_repair_deposit', { repair: { paymentDeadline: 'd' } }))).toBe('d')
    expect(deadlineFor(v('awaiting_final_payment'))).toBeNull()
  })
})
