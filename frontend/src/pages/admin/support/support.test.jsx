import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ToastProvider } from '../../../components/ui/index.js'
import ProblemsQueue from './ProblemsQueue.jsx'
import ProblemDetail from './ProblemDetail.jsx'
import PaymentsQueue from './PaymentsQueue.jsx'

// Radix radio group measures with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }

const REPORTED = '2026-03-01T10:00:00.000Z'
const doc = {
  _id: 'req1', homeowner: 'aaaaaaaaaaaaaaaaaaaa0001', artisan: 'bbbbbbbbbbbbbbbbbbbb0002',
  status: 'problem_reported', description: 'Leaking pipe', serviceAddress: '4 Marina Rd',
  inspectionWindow: { start: '2026-02-01T09:00:00Z', end: '2026-02-01T11:00:00Z' },
  inspectionFee: { amount: 500000, currency: 'NGN' },
  quote: { total: { amount: 5000000, currency: 'NGN' }, depositAmount: 2500000, balanceAmount: 2500000, window: { start: '2026-02-10T09:00:00Z', end: '2026-02-10T17:00:00Z' } },
  verifiedPayments: [], supportResolutions: [],
  problem: { explanation: 'Still leaking after the repair', reportedAt: REPORTED },
}
const payment = { _id: 'pay_ref_1', requestId: 'req1', purpose: 'repair_deposit', amount: 2500000, currency: 'NGN', reason: 'Late payment', createdAt: '2026-03-02T10:00:00Z' }
const ok = (data, total = Array.isArray(data) ? data.length : 1) => ({ ok: true, status: 200, json: async () => ({ data, meta: { total, page: 1, limit: 20, totalPages: 1 } }) })
const fail = (status, message) => ({ ok: false, status, json: async () => ({ message }) })

function route(handlers) {
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${String(url).split('?')[0].replace('/api/v1', '')}`
    const h = handlers[key]
    if (!h) throw new Error(`unmocked ${key}`)
    return typeof h === 'function' ? h(init) : h
  })
}
const posts = () => globalThis.fetch.mock.calls.filter(([, i]) => i?.method === 'POST')

function mount(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/support/problems" element={<ProblemsQueue />} />
            <Route path="/admin/support/problems/:id" element={<ProblemDetail />} />
            <Route path="/admin/support/payments" element={<PaymentsQueue />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

test('empty states', async () => {
  route({ 'GET /admin/support/requests': ok([], 0), 'GET /admin/support/payments': ok([], 0) })
  const first = mount('/admin/support/problems')
  expect(await screen.findByText('No problems waiting.')).toBeInTheDocument()
  first.unmount()
  mount('/admin/support/payments')
  expect(await screen.findByText('No payments need reconciliation.')).toBeInTheDocument()
})

test('the queues drop the tab strip and show the count in the header summary', async () => {
  route({ 'GET /admin/support/requests': ok([doc], 3), 'GET /admin/support/payments': ok([payment], 5) })
  const first = mount('/admin/support/problems')
  expect(await screen.findByText('3 problems waiting')).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Support queues' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /^(Problems|Payments)( \(\d+\))?$/ })).not.toBeInTheDocument()
  first.unmount()

  mount('/admin/support/payments')
  expect(await screen.findByText('5 payments to reconcile')).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Support queues' })).not.toBeInTheDocument()
})

test('each queue has one h1 and lists its rows', async () => {
  route({ 'GET /admin/support/requests': ok([doc]), 'GET /admin/support/payments': ok([payment]) })
  const first = mount('/admin/support/problems')
  const list = await screen.findByRole('list', { name: 'Reported problems' })
  expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  expect(within(list).getByRole('link')).toHaveAttribute('href', '/admin/support/problems/req1')
  expect(screen.getByRole('heading', { level: 1, name: 'Problems' })).toBeInTheDocument()
  first.unmount()

  mount('/admin/support/payments')
  const rows = await screen.findByRole('list', { name: 'Payments to reconcile' })
  expect(within(rows).getAllByRole('listitem')).toHaveLength(1)
  expect(within(rows).getByRole('button', { name: 'Resolve' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1, name: 'Payments' })).toBeInTheDocument()
})

test('the problem detail has a back link and hides ids', async () => {
  route({ 'GET /admin/support/requests/req1': ok(doc) })
  mount('/admin/support/problems/req1')
  expect(await screen.findByRole('link', { name: 'Back to problems' })).toHaveAttribute('href', '/admin/support/problems')
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.queryByText(/0001|0002/)).not.toBeInTheDocument()
})

async function fillNote(user, text) {
  await user.type(screen.getByLabelText('Note'), text)
}

test('closing requires a reference and sends problemReportedAt from the doc', async () => {
  route({
    'GET /admin/support/requests/req1': ok(doc),
    'GET /admin/support/requests': ok([], 0),
    'GET /admin/support/payments': ok([], 0),
    'POST /admin/support/requests/req1/resolve': ok({}),
  })
  const user = userEvent.setup()
  mount('/admin/support/problems/req1')
  await user.click(await screen.findByLabelText('Close the job'))
  await fillNote(user, 'Called both sides')
  await user.click(screen.getByRole('button', { name: 'Review resolution' }))
  expect(await screen.findByText(/Add your ticket or call reference/)).toBeInTheDocument()
  expect(posts()).toHaveLength(0)

  await user.type(screen.getByLabelText('Resolution reference'), 'TCK-9')
  await user.click(screen.getByRole('button', { name: 'Review resolution' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).getByText('Ends the job as closed by support. This does not record a payment or refund.')).toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Close the job' }))
  await waitFor(() => expect(posts()).toHaveLength(1))
  expect(JSON.parse(posts()[0][1].body)).toEqual({
    disposition: 'close', note: 'Called both sides', problemReportedAt: REPORTED, resolutionReference: 'TCK-9',
  })
  expect(await screen.findByText('Job closed')).toBeInTheDocument()
})

test('a 409 keeps the note and refetches the problem', async () => {
  route({
    'GET /admin/support/requests/req1': ok(doc),
    'GET /admin/support/requests': ok([], 0),
    'GET /admin/support/payments': ok([], 0),
    'POST /admin/support/requests/req1/resolve': fail(409, 'The reported problem changed'),
  })
  const user = userEvent.setup()
  mount('/admin/support/problems/req1')
  await user.click(await screen.findByLabelText('Return to homeowner confirmation'))
  await fillNote(user, 'Keep this text')
  await user.click(screen.getByRole('button', { name: 'Review resolution' }))
  const dialog = await screen.findByRole('alertdialog')
  expect(within(dialog).getByText('The homeowner can confirm the repair or report again.')).toBeInTheDocument()
  const before = globalThis.fetch.mock.calls.filter(([u, i]) => String(u).endsWith('/requests/req1') && !i?.method || i?.method === 'GET' && String(u).endsWith('/requests/req1')).length
  await user.click(within(dialog).getByRole('button', { name: 'Return to homeowner' }))
  expect(await within(dialog).findByText('The reported problem changed')).toBeInTheDocument()
  await waitFor(() => {
    const after = globalThis.fetch.mock.calls.filter(([u, i]) => String(u).endsWith('/requests/req1') && (!i?.method || i.method === 'GET')).length
    expect(after).toBeGreaterThan(before)
  })
  expect(screen.getByLabelText('Note')).toHaveValue('Keep this text')
})

test('payment resolve sends the prefilled paymentReference', async () => {
  route({
    'GET /admin/support/payments': ok([payment]),
    'GET /admin/support/requests': ok([], 0),
    'POST /admin/support/payments/resolve': ok({}),
  })
  const user = userEvent.setup()
  mount('/admin/support/payments')
  await user.click(await screen.findByRole('button', { name: 'Resolve' }))
  const form = await screen.findByRole('dialog')
  const ref = within(form).getByLabelText('Payment reference')
  expect(ref).toHaveValue('pay_ref_1')
  expect(ref).toHaveAttribute('readonly')
  await user.click(within(form).getByLabelText('Refunded outside Fixly'))
  await user.type(within(form).getByLabelText('Note'), 'Refunded by bank transfer')
  await user.type(within(form).getByLabelText('Resolution reference'), 'CALL-4')
  await user.click(within(form).getByRole('button', { name: 'Review resolution' }))
  const confirm = await screen.findByRole('alertdialog')
  await user.click(within(confirm).getByRole('button', { name: 'Record resolution' }))
  await waitFor(() => expect(posts()).toHaveLength(1))
  expect(JSON.parse(posts()[0][1].body)).toEqual({
    paymentReference: 'pay_ref_1', disposition: 'externally_refunded', note: 'Refunded by bank transfer', resolutionReference: 'CALL-4',
  })
  expect(await screen.findByText('Marked as refunded outside Fixly')).toBeInTheDocument()
})

describe('automatic refunds in the payments queue', () => {
  const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString()
  const paid = (id, over = {}) => ({ ...payment, _id: `paystack:fx-dep-${id}`, createdAt: minutesAgo(60), ...over })

  test('shows what each refund is doing, offers Resolve only where a person must act, and lists those first', async () => {
    route({
      'GET /admin/support/requests': ok([], 0),
      'GET /admin/support/payments': ok([
        paid('requesting', { refund: { state: 'requesting' } }),
        paid('pending', { refund: { state: 'pending' } }),
        paid('starting', { createdAt: minutesAgo(2) }),
        paid('failed', { refund: { state: 'failed', failureReason: 'Paystack refused the refund: Insufficient balance' } }),
        paid('attention', { refund: { state: 'needs_attention', failureReason: 'Paystack needs action on this refund.' } }),
        paid('stalled', { createdAt: minutesAgo(45) }),
        { ...payment, _id: 'simulated:1' },
      ], 7),
    })
    mount('/admin/support/payments')
    const list = await screen.findByRole('list', { name: 'Payments to reconcile' })
    expect(screen.getByText('7 payments to reconcile, 4 need you')).toBeInTheDocument()

    expect(within(list).getByText('Refunding automatically')).toBeInTheDocument()
    expect(within(list).getByText('Refund sent, waiting for Paystack')).toBeInTheDocument()
    expect(within(list).getByText('Refund starting')).toBeInTheDocument()
    expect(within(list).getByText('Refund failed')).toBeInTheDocument()
    expect(within(list).getByText('Paystack refused the refund: Insufficient balance')).toBeInTheDocument()
    expect(within(list).getByText('Needs attention')).toBeInTheDocument()
    expect(within(list).getByText('Refund didn’t start')).toBeInTheDocument()
    expect(within(list).getByText('Not refunded automatically')).toBeInTheDocument()

    expect(within(list).getAllByRole('button', { name: 'Resolve' })).toHaveLength(4)
    expect(within(list).getAllByText('No action needed')).toHaveLength(3)

    // Rows needing a person come first, each group keeping the server's order.
    const order = [...list.textContent.matchAll(/paystack:fx-dep-(requesting|pending|starting|failed|attention|stalled)|simulated:1/g)].map((m) => m[1] ?? 'simulated')
    expect(order).toEqual(['failed', 'attention', 'stalled', 'simulated', 'requesting', 'pending', 'starting'])
  })

  test('refreshes the queue when the server says a refund started meanwhile', async () => {
    let queue = [paid('race')]
    route({
      'GET /admin/support/requests': ok([], 0),
      'GET /admin/support/payments': () => ok(queue),
      'POST /admin/support/payments/resolve': () => {
        queue = [paid('race', { refund: { state: 'requesting' } })]
        return fail(409, 'An automatic refund is in progress for this payment. Wait for it to finish before resolving it.')
      },
    })
    const user = userEvent.setup()
    mount('/admin/support/payments')
    await user.click(await screen.findByRole('button', { name: 'Resolve' }))
    const form = await screen.findByRole('dialog')
    await user.click(within(form).getByLabelText('Refunded outside Fixly'))
    await user.type(within(form).getByLabelText('Note'), 'Checked')
    await user.type(within(form).getByLabelText('Resolution reference'), 'T-1')
    await user.click(within(form).getByRole('button', { name: 'Review resolution' }))
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: 'Record resolution' }))
    expect(await screen.findByText(/automatic refund is in progress/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Refunding automatically')).toBeInTheDocument())
    expect(screen.getByText('No action needed')).toBeInTheDocument()
  })
})
