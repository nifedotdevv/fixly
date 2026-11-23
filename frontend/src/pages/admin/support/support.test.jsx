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

test('queue tabs show totals', async () => {
  route({ 'GET /admin/support/requests': ok([doc], 3), 'GET /admin/support/payments': ok([payment], 5) })
  mount('/admin/support/problems')
  expect(await screen.findByRole('link', { name: 'Problems (3)' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Payments (5)' })).toBeInTheDocument()
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
})
