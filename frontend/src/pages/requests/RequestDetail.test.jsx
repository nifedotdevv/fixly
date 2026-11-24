import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ToastProvider } from '../../components/ui/index.js'
import { REQUEST_STATUSES, isPaymentWaiting } from '../../lib/requestStatus.js'
import { openCheckout } from '../../lib/paystack.js'
import RequestDetail from './RequestDetail.jsx'
import { LOAD_TIMEOUT_MS } from './usePayment.js'

vi.mock('../../lib/paystack.js', () => ({ openCheckout: vi.fn() }))

let auth = { me: { role: 'house_owner' } }
vi.mock('../../auth/useAuth.js', () => ({ useAuth: () => auth }))

const iso = (min) => new Date(Date.now() + min * 60000).toISOString()
const money = (amount) => ({ amount, currency: 'NGN' })
const person = (name) => ({ id: 'x', name, avatar: null })
const win = (a, b) => ({ start: iso(a), end: iso(b) })
const quote = (over = {}) => ({
  scope: 'Replace the cistern',
  total: money(10000000),
  depositAmount: 7000000,
  balanceAmount: 3000000,
  window: win(1000, 1100),
  expiresAt: iso(600),
  submittedAt: iso(-300),
  ...over,
})

const view = (status, over = {}) => ({
  id: 'r1',
  status,
  description: 'Leaking tap',
  serviceAddress: '12 Allen Avenue, Ikeja',
  inspectionWindow: win(100, 160),
  createdAt: iso(-1000),
  notes: [],
  payments: [],
  participants: { homeowner: person('Ada Owner'), artisan: person('Tunde Artisan') },
  ...over,
})

const withQuote = { quote: quote(), inspectionFee: money(500000) }
const FIXTURES = {
  pending: view('pending', { responseDeadline: iso(60) }),
  rejected: view('rejected', { rejectionReason: 'Too far away', rejectedAt: iso(-10) }),
  response_expired: view('response_expired'),
  cancelled: view('cancelled', { cancelledAt: iso(-5) }),
  awaiting_inspection_payment: view('awaiting_inspection_payment', {
    inspectionFee: money(500000),
    inspection: { window: win(100, 160), paymentDeadline: iso(25) },
  }),
  inspection_payment_expired: view('inspection_payment_expired'),
  inspection_confirmed: view('inspection_confirmed', { inspection: { window: win(-60, -10) } }),
  inspection_completed: view('inspection_completed'),
  quote_submitted: view('quote_submitted', withQuote),
  quote_expired: view('quote_expired', withQuote),
  repair_not_proceeding: view('repair_not_proceeding', withQuote),
  awaiting_repair_deposit: view('awaiting_repair_deposit', { ...withQuote, repair: { paymentDeadline: iso(90) } }),
  repair_payment_expired: view('repair_payment_expired', withQuote),
  repair_confirmed: view('repair_confirmed', { ...withQuote, repair: { window: win(-30, 60) } }),
  repair_in_progress: view('repair_in_progress', withQuote),
  awaiting_homeowner_confirmation: view('awaiting_homeowner_confirmation', withQuote),
  problem_reported: view('problem_reported', {
    ...withQuote,
    problem: { explanation: 'The pipe still drips', reportedAt: iso(-20) },
  }),
  awaiting_final_payment: view('awaiting_final_payment', withQuote),
  completed: view('completed', { ...withQuote, review: { rating: 4, comment: 'Tidy work', createdAt: iso(-2) } }),
  support_closed: view('support_closed', withQuote),
}

const PRIMARY = {
  awaiting_inspection_payment: 'payment-waiting',
  awaiting_repair_deposit: 'payment-waiting',
  awaiting_final_payment: 'payment-waiting',
  problem_reported: 'support',
  completed: 'completed',
  rejected: 'ended',
  response_expired: 'ended',
  cancelled: 'ended',
  inspection_payment_expired: 'ended',
  quote_expired: 'ended',
  repair_not_proceeding: 'ended',
  repair_payment_expired: 'ended',
  support_closed: 'ended',
}

function serve(handlers) {
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`
    const h = handlers[key]
    const [status, body] = typeof h === 'function' ? h() : h ?? [404, { message: 'Not found' }]
    return { ok: status < 400, status, json: async () => body }
  })
}
const ok = (data) => [200, { data }]

function mount(id = 'r1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/requests/${id}`]}>
          <Routes>
            <Route path="/requests/:id" element={<RequestDetail />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

const panels = (container) => [...container.querySelectorAll('[data-panel]')].map((el) => el.dataset.panel)

beforeEach(() => { auth = { me: { role: 'house_owner' } } })

test('fixtures cover all 20 statuses', () => {
  expect(Object.keys(FIXTURES).sort()).toEqual([...REQUEST_STATUSES].sort())
})

describe.each(['house_owner', 'artisan'])('as %s', (role) => {
  test.each(REQUEST_STATUSES)('%s renders the right panel, with a pay control only for the homeowner when payment is due', async (status) => {
    auth = { me: { role } }
    serve({ 'GET /service-requests/r1': ok(FIXTURES[status]) })
    const { container } = mount()
    await screen.findByRole('heading', { level: 1 })
    const shown = panels(container)
    if (PRIMARY[status]) expect(shown[0]).toBe(PRIMARY[status])
    else expect(shown).not.toContain('payment-waiting')
    if (FIXTURES[status].quote) expect(shown).toContain('quote')
    const payable = role === 'house_owner' && isPaymentWaiting(status)
    expect(screen.queryAllByRole('button', { name: /^pay\b/i })).toHaveLength(payable ? 1 : 0)
    expect(screen.queryByRole('link', { name: /^pay\b/i })).toBeNull()
  })
})

describe('paying', () => {
  const START = 'POST /service-requests/r1/payments'
  const VERIFY = 'POST /service-requests/r1/payments/fx-dep-ours/verify'
  const started = ok({ reference: 'fx-dep-ours', accessCode: 'ac_1', purpose: 'repair_deposit', amount: 7000000, currency: 'NGN' })
  const checked = (data) => ok({ reference: 'fx-dep-ours', purpose: 'repair_deposit', request: FIXTURES.awaiting_repair_deposit, ...data })
  const popup = (outcome) => openCheckout.mockImplementation(async (_code, callbacks) => { callbacks[outcome]({ reference: 'someone-elses' }) })
  const calls = () => globalThis.fetch.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${String(url).replace('/api/v1', '')}`)
  const payButton = () => screen.findByRole('button', { name: 'Pay ₦70,000.00' })
  beforeEach(() => { openCheckout.mockReset() })

  test('the artisan sees who pays and no pay control', async () => {
    auth = { me: { role: 'artisan' } }
    serve({ 'GET /service-requests/r1': ok(FIXTURES.awaiting_repair_deposit) })
    mount()
    await screen.findByRole('heading', { level: 2, name: 'Waiting for payment' })
    expect(screen.getByText(/The homeowner pays the repair deposit through Paystack/)).toBeInTheDocument()
    expect(screen.getByText(/Amount due/).parentElement).toHaveTextContent('70,000.00')
    expect(screen.getByText(/^Deposit due .* left$/)).toBeInTheDocument()
  })

  test('pays through the popup, and the server confirms with our own reference', async () => {
    serve({
      'GET /service-requests/r1': ok(FIXTURES.awaiting_repair_deposit),
      [START]: started,
      [VERIFY]: checked({ status: 'success', outcome: 'applied', request: FIXTURES.repair_confirmed }),
    })
    popup('onSuccess')
    mount()
    await screen.findByRole('heading', { level: 2, name: 'Pay the repair deposit' })
    expect(screen.getByText(/Fixly never sees your card or bank details/)).toBeInTheDocument()
    await userEvent.click(await payButton())
    await screen.findByText('Payment received')
    expect(openCheckout).toHaveBeenCalledWith('ac_1', expect.any(Object))
    expect(calls()).toEqual(['GET /service-requests/r1', START, VERIFY])
    // The booking moved on: no pay control is left.
    await waitFor(() => expect(screen.queryByRole('button', { name: /^pay\b/i })).toBeNull())
  })

  test('closing the popup checks quietly, so a payment made just before closing still counts', async () => {
    serve({ 'GET /service-requests/r1': ok(FIXTURES.awaiting_repair_deposit), [START]: started, [VERIFY]: checked({ status: 'abandoned', outcome: null }) })
    popup('onCancel')
    mount()
    await userEvent.click(await payButton())
    await waitFor(() => expect(calls()).toContain(VERIFY))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(await payButton()).not.toHaveAttribute('aria-busy')
  })

  test('a payment that cannot count shows the refund notice, even after the stage changes', async () => {
    serve({
      'GET /service-requests/r1': ok(FIXTURES.awaiting_repair_deposit), [START]: started,
      [VERIFY]: checked({ status: 'success', outcome: 'reconciliation_required', request: FIXTURES.repair_payment_expired }),
    })
    popup('onSuccess')
    mount()
    await userEvent.click(await payButton())
    await screen.findByText(/couldn.t be applied to this booking/)
    expect(screen.getByText(/refunded to you in full automatically/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByText(/couldn.t be applied to this booking/)).toBeNull()
  })

  test('a payment Paystack is still processing can be checked again', async () => {
    let answer = checked({ status: 'pending', outcome: null })
    serve({
      'GET /service-requests/r1': ok(FIXTURES.awaiting_repair_deposit), [START]: started, [VERIFY]: () => answer,
    })
    popup('onSuccess')
    mount()
    await userEvent.click(await payButton())
    await screen.findByText(/Paystack is still processing this payment/)
    answer = checked({ status: 'success', outcome: 'applied', request: FIXTURES.repair_confirmed })
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await screen.findByText('Payment received')
  })

  test('a failed payment says nothing was taken and lets the homeowner try again', async () => {
    serve({ 'GET /service-requests/r1': ok(FIXTURES.awaiting_repair_deposit), [START]: started, [VERIFY]: checked({ status: 'failed', outcome: null }) })
    popup('onSuccess')
    mount()
    await userEvent.click(await payButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn.t go through, and nothing was taken/)
    expect(await payButton()).toBeEnabled()
  })

  test('shows why a checkout could not start, and refreshes the request when the stage moved on', async () => {
    serve({
      'GET /service-requests/r1': ok(FIXTURES.awaiting_repair_deposit),
      [START]: [409, { message: 'This payment was already made. Reload the request to see it.', code: 'PAYMENT_ALREADY_MADE' }],
    })
    mount()
    await userEvent.click(await payButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('This payment was already made')
    expect(openCheckout).not.toHaveBeenCalled()
    await waitFor(() => expect(calls().filter((call) => call === 'GET /service-requests/r1').length).toBeGreaterThan(1))
  })

  test('says so when the Paystack checkout cannot load', async () => {
    serve({ 'GET /service-requests/r1': ok(FIXTURES.awaiting_repair_deposit), [START]: started })
    openCheckout.mockRejectedValue(new Error('script failed'))
    mount()
    await userEvent.click(await payButton())
    expect(await screen.findByRole('alert')).toHaveTextContent(/checkout couldn.t open/)
  })

  test('stops waiting when the Paystack checkout never shows, and a late success still counts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      let callbacks
      const close = vi.fn()
      openCheckout.mockImplementation(async (_code, given) => { callbacks = given; return close })
      serve({ 'GET /service-requests/r1': ok(FIXTURES.awaiting_repair_deposit), [START]: started,
        [VERIFY]: checked({ status: 'success', outcome: 'applied', request: FIXTURES.repair_confirmed }) })
      mount()
      await userEvent.click(await payButton())
      await waitFor(() => expect(openCheckout).toHaveBeenCalled())
      expect(screen.queryByRole('alert')).toBeNull()
      await act(() => vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS))
      expect(await screen.findByRole('alert')).toHaveTextContent(/checkout couldn.t open/)
      expect(close).toHaveBeenCalledOnce()
      await act(async () => callbacks.onSuccess({ reference: 'fx-dep-ours' }))
      await screen.findByText('Payment received')
    } finally { vi.useRealTimers() }
  })

  test('does not give up on a checkout that loaded', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      openCheckout.mockImplementation(async (_code, callbacks) => { callbacks.onLoad({}) })
      serve({ 'GET /service-requests/r1': ok(FIXTURES.awaiting_repair_deposit), [START]: started })
      mount()
      await userEvent.click(await payButton())
      await waitFor(() => expect(openCheckout).toHaveBeenCalled())
      await act(() => vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS * 2))
      expect(screen.queryByRole('alert')).toBeNull()
    } finally { vi.useRealTimers() }
  })

  test('cannot pay once the time to pay has run out', async () => {
    serve({ 'GET /service-requests/r1': ok({ ...FIXTURES.awaiting_repair_deposit, repair: { paymentDeadline: iso(-1) } }) })
    mount()
    expect(await payButton()).toBeDisabled()
  })
})

test('support panel, ended copy and find-another link', async () => {
  serve({ 'GET /service-requests/r1': ok(FIXTURES.problem_reported) })
  const first = mount()
  await screen.findByText(/Fixly support is reviewing this/)
  expect(screen.getByText('The pipe still drips')).toBeInTheDocument()
  first.unmount()

  serve({ 'GET /service-requests/r1': ok(FIXTURES.support_closed) })
  const second = mount()
  await screen.findByText(/Closed by Fixly support. This is not a payment or refund./)
  expect(screen.queryByRole('link', { name: 'Find another artisan' })).toBeNull()
  second.unmount()

  serve({ 'GET /service-requests/r1': ok(FIXTURES.rejected) })
  mount()
  await screen.findByText(/Too far away/)
  expect(screen.getByRole('link', { name: 'Find another artisan' })).toHaveAttribute('href', '/artisans')
})

test('artisan does not get the find-another link and sees the homeowner in the title', async () => {
  auth = { me: { role: 'artisan' } }
  serve({ 'GET /service-requests/r1': ok(FIXTURES.rejected) })
  mount()
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ada Owner: Declined')
  expect(screen.queryByRole('link', { name: 'Find another artisan' })).toBeNull()
})

test('completed shows the existing review', async () => {
  serve({ 'GET /service-requests/r1': ok(FIXTURES.completed) })
  mount()
  await screen.findByText('Tidy work')
  expect(screen.getByText(/4 out of 5/)).toBeInTheDocument()
})

test('actions with body fields render nothing without a form', async () => {
  auth = { me: { role: 'artisan' } }
  serve({ 'GET /service-requests/r1': ok(FIXTURES.pending) })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  mount()
  expect(await screen.findByRole('heading', { name: 'Your turn: reply to this request' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Accept with inspection fee/ })).toBeNull()
  expect(screen.queryByText(/coming next/)).toBeNull()
  warn.mockRestore()
})

test('renderActionForm replaces the placeholder', async () => {
  auth = { me: { role: 'artisan' } }
  serve({ 'GET /service-requests/r1': ok(FIXTURES.pending) })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/requests/r1']}>
          <Routes>
            <Route path="/requests/:id" element={<RequestDetail renderActionForm={(a) => <p>form for {a.id}</p>} />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
  expect(await screen.findByText('form for accept')).toBeInTheDocument()
})

test('a time-gated action is disabled with its availability time', async () => {
  auth = { me: { role: 'artisan' } }
  serve({ 'GET /service-requests/r1': ok(view('inspection_confirmed', { inspection: { window: win(30, 90) } })) })
  mount()
  expect(await screen.findByRole('button', { name: 'Mark inspection done' })).toBeDisabled()
  expect(screen.getByText(/Available from/)).toBeInTheDocument()
})

test('an open time-gated action is enabled and posts', async () => {
  auth = { me: { role: 'artisan' } }
  const done = view('inspection_completed')
  serve({
    'GET /service-requests/r1': ok(FIXTURES.inspection_confirmed),
    'POST /service-requests/r1/inspection/complete': ok(done),
  })
  mount()
  await userEvent.click(await screen.findByRole('button', { name: 'Mark inspection done' }))
  const dialog = await screen.findByRole('alertdialog')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Mark inspection done' }))
  expect(await screen.findByText('Inspection marked done')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inspected, quote coming'))
})

test('a 409 shows the conflict notice and refetches', async () => {
  const fresh = view('quote_expired', withQuote)
  let gets = 0
  serve({
    'GET /service-requests/r1': () => ok(++gets === 1 ? FIXTURES.quote_submitted : fresh),
    'POST /service-requests/r1/quote/approve': [409, { message: 'Stage changed' }],
  })
  mount()
  await userEvent.click(await screen.findByRole('button', { name: 'Approve quote' }))
  expect(await screen.findByText(/This job changed while you were looking/)).toBeInTheDocument()
  await waitFor(() => expect(gets).toBe(2))
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Quote expired'))
})

test('the stage heading names the stage and the viewer role', async () => {
  serve({ 'GET /service-requests/r1': ok(FIXTURES.quote_submitted) })
  const first = mount()
  expect(await screen.findByRole('heading', { level: 2, name: 'Your turn: review the quote' })).toBeInTheDocument()
  first.unmount()
  auth = { me: { role: 'artisan' } }
  mount()
  expect(await screen.findByRole('heading', { level: 2, name: 'Waiting for the homeowner to approve your quote' })).toBeInTheDocument()
})

test('a confirm action opens the dialog before posting', async () => {
  serve({
    'GET /service-requests/r1': ok(FIXTURES.quote_submitted),
    'POST /service-requests/r1/quote/decline': ok(FIXTURES.repair_not_proceeding),
  })
  mount()
  await userEvent.click(await screen.findByRole('button', { name: 'Decline quote' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  expect(within(dialog).getByText("Decline Tunde Artisan's quote?")).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Decline quote' }))
  expect(await screen.findByText('Quote declined')).toBeInTheDocument()
})

test('participant fallback and history with zones', async () => {
  const v = view('pending', {
    participants: { homeowner: person('Ada Owner'), artisan: { id: 'x', name: null, avatar: null } },
    notes: [{ text: 'Gate code is 1234', createdAt: iso(-50) }],
    responseDeadline: iso(60),
  })
  serve({ 'GET /service-requests/r1': ok(v) })
  mount()
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Former Fixly user: Waiting for artisan')
  expect(screen.getAllByText('Former Fixly user').length).toBeGreaterThan(0)
  expect(screen.getByText('Homeowner note')).toBeInTheDocument()
  expect(screen.getByText('Gate code is 1234')).toBeInTheDocument()
  expect(screen.getByText('Request sent')).toBeInTheDocument()
  expect(screen.getByText(/Fixly doesn.t offer messaging/)).toBeInTheDocument()
})

test('a missing request shows the not-found state', async () => {
  serve({})
  mount('nope')
  expect(await screen.findByRole('heading', { level: 1, name: 'Request not found' })).toBeInTheDocument()
  expect(screen.getByText("This request doesn't exist or isn't yours.")).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to requests' })).toHaveAttribute('href', '/requests')
})

test('a bad id (400) shows the same state', async () => {
  serve({ 'GET /service-requests/bad': [400, { message: 'Invalid id' }] })
  mount('bad')
  expect(await screen.findByText("This request doesn't exist or isn't yours.")).toBeInTheDocument()
})

test('the header links back to the request list', async () => {
  serve({ 'GET /service-requests/r1': ok(FIXTURES.quote_submitted) })
  mount()
  await screen.findByRole('heading', { level: 1 })
  expect(screen.getByRole('link', { name: 'Back to requests' })).toHaveAttribute('href', '/requests')
})

test('the facts panel groups people, schedule and money', async () => {
  serve({ 'GET /service-requests/r1': ok(FIXTURES.quote_submitted) })
  mount()
  const facts = await screen.findByRole('complementary', { name: 'Request facts' })
  expect(within(facts).getByRole('heading', { level: 2, name: 'Details' })).toBeInTheDocument()
  for (const name of ['People', 'Schedule', 'Money']) {
    expect(within(facts).getByRole('heading', { level: 3, name })).toBeInTheDocument()
  }
})

test('panels are never nested', async () => {
  serve({ 'GET /service-requests/r1': ok(FIXTURES.quote_submitted) })
  const { container } = mount()
  await screen.findByRole('heading', { level: 1 })
  const sel = 'section.rounded-lg.border.bg-surface, aside.rounded-lg.border.bg-surface'
  const bordered = [...container.querySelectorAll(sel)]
  expect(bordered.length).toBeGreaterThan(3)
  for (const el of bordered) expect(el.parentElement.closest(sel)).toBeNull()
})

test('the loading state has role=status', () => {
  serve({ 'GET /service-requests/r1': () => new Promise(() => {}) })
  mount()
  expect(screen.getByRole('status', { name: 'Loading request' })).toBeInTheDocument()
})
