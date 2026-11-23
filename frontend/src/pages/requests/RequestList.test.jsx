import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import RequestList from './RequestList.jsx'

let auth = { me: { role: 'house_owner' } }
vi.mock('../../auth/useAuth.js', () => ({ useAuth: () => auth }))

const future = (min) => new Date(Date.now() + min * 60000).toISOString()
const person = (name) => ({ id: 'x', name, avatar: null })
const view = (id, status, over = {}) => ({
  id,
  status,
  description: `Job ${id}\nsecond line`,
  updatedAt: '2026-01-01T10:00:00Z',
  participants: { homeowner: person(`Owner ${id}`), artisan: person(`Artisan ${id}`) },
  ...over,
})

const fixture = [
  view('quote', 'quote_submitted', { quote: { total: { amount: 5000000, currency: 'NGN' }, expiresAt: future(60) } }),
  view('pend-late', 'pending', { responseDeadline: future(120) }),
  view('pend-soon', 'pending', { responseDeadline: future(20) }),
  view('done', 'completed', { review: { rating: 5 } }),
]

function reply(data, meta = {}) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data, meta: { total: data.length, page: 1, limit: 100, totalPages: 1, ...meta } }),
  })
}

const Where = () => <p data-testid="search">{useLocation().search}</p>
function mount(path = '/requests') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/requests" element={<><RequestList /><Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const hrefs = (el) => within(el).getAllByRole('link').map((a) => a.getAttribute('href'))
const tab = (name) => screen.findByRole('tab', { name })
const panel = () => screen.getByRole('tabpanel')

beforeEach(() => { auth = { me: { role: 'house_owner' } } })

test('homeowner and artisan see the same fixture grouped differently', async () => {
  const user = userEvent.setup()
  reply(fixture)
  const first = mount()
  await tab(/Needs you, 1/)
  expect(globalThis.fetch.mock.calls[0][0]).toContain('limit=100')
  expect(hrefs(panel())).toEqual(['/requests/quote'])
  await user.click(screen.getByRole('tab', { name: /Waiting, 2/ }))
  expect(hrefs(panel())).toEqual(['/requests/pend-soon', '/requests/pend-late'])
  await user.click(screen.getByRole('tab', { name: /Finished, 1/ }))
  expect(hrefs(panel())).toEqual(['/requests/done'])
  first.unmount()

  auth = { me: { role: 'artisan' } }
  reply(fixture)
  mount()
  await tab(/Needs you, 2/)
  expect(hrefs(panel())).toEqual(['/requests/pend-soon', '/requests/pend-late'])
  await user.click(screen.getByRole('tab', { name: /Waiting, 1/ }))
  expect(hrefs(panel())).toEqual(['/requests/quote'])
})

test('rows show the other party, first line, money and deadline', async () => {
  reply(fixture)
  mount()
  const row = (await screen.findByRole('link', { name: /Artisan quote/ }))
  expect(row).toHaveTextContent('Job quote')
  expect(row).not.toHaveTextContent('second line')
  expect(row).toHaveTextContent('Quote ready')
  expect(row).toHaveTextContent('50,000.00')
  expect(row).toHaveTextContent('Quote expires')
})

test('each row is a single link to its request', async () => {
  reply(fixture)
  mount()
  await tab(/Needs you, 1/)
  const links = within(panel()).getAllByRole('link')
  expect(links).toHaveLength(1)
  expect(links[0]).toHaveAttribute('href', '/requests/quote')
  expect(within(panel()).getAllByRole('listitem')).toHaveLength(1)
})

test('status filter writes ?status= and shows a flat paginated list', async () => {
  const user = userEvent.setup()
  reply(fixture)
  mount('/requests?tab=waiting')
  await tab(/Needs you, 1/)
  reply([view('p1', 'pending')], { totalPages: 2 })
  await user.selectOptions(screen.getByLabelText('Status'), 'pending')
  await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?status=pending'))
  expect(screen.getByTestId('search')).not.toHaveTextContent('tab=')
  await screen.findByRole('link', { name: /Artisan p1/ })
  expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  expect(globalThis.fetch.mock.calls[0][0]).toContain('status=pending')
  expect(globalThis.fetch.mock.calls[0][0]).toContain('page=1')
  await user.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('page=2'))
})

test('Clear filters clears the status', async () => {
  const user = userEvent.setup()
  reply([view('p1', 'pending')])
  mount('/requests?status=pending&page=2')
  await screen.findByRole('link', { name: /Artisan p1/ })
  reply(fixture)
  await user.click(screen.getByRole('button', { name: 'Clear filters' }))
  await tab(/Needs you, 1/)
  expect(screen.getByTestId('search')).toHaveTextContent('')
  expect(screen.getByTestId('search').textContent).toBe('')
  expect(screen.getByLabelText('Status')).toHaveValue('')
})

test('default tab is needs-you, else waiting', async () => {
  reply(fixture)
  const first = mount()
  expect(await tab(/Needs you, 1/)).toHaveAttribute('aria-selected', 'true')
  first.unmount()

  reply([view('w', 'pending'), view('d', 'completed', { review: { rating: 5 } })])
  mount()
  expect(await tab(/Waiting, 1/)).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tab', { name: /Needs you, 0/ })).toHaveAttribute('aria-selected', 'false')
})

test('?tab=finished opens Finished', async () => {
  reply(fixture)
  mount('/requests?tab=finished')
  expect(await tab(/Finished, 1/)).toHaveAttribute('aria-selected', 'true')
  expect(hrefs(panel())).toEqual(['/requests/done'])
})

test('an empty tab shows its message', async () => {
  const user = userEvent.setup()
  reply([view('w', 'pending')])
  mount()
  await tab(/Waiting, 1/)
  await user.click(screen.getByRole('tab', { name: /Needs you, 0/ }))
  expect(within(panel()).getByText('Nothing needs you right now.')).toBeInTheDocument()
})

test('only homeowners get the Find an artisan header action', async () => {
  reply(fixture)
  const first = mount()
  await tab(/Needs you/)
  expect(screen.getByRole('link', { name: 'Find an artisan' })).toHaveAttribute('href', '/artisans')
  first.unmount()

  auth = { me: { role: 'artisan' } }
  reply(fixture)
  mount()
  await tab(/Needs you/)
  expect(screen.queryByRole('link', { name: 'Find an artisan' })).not.toBeInTheDocument()
})

test('collapses finished after 10 rows', async () => {
  const user = userEvent.setup()
  reply(Array.from({ length: 12 }, (_, i) => view(`f${i}`, 'cancelled')))
  mount()
  await tab(/Finished, 12/)
  expect(within(panel()).getAllByRole('link')).toHaveLength(10)
  await user.click(screen.getByRole('button', { name: 'Show all finished (12)' }))
  expect(within(panel()).getAllByRole('link')).toHaveLength(12)
})

test('notes the 100 row cap and focuses the filter', async () => {
  const user = userEvent.setup()
  reply(fixture, { total: 150 })
  mount()
  await tab(/Needs you/)
  expect(screen.getByText(/Showing your 100 most recent requests/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Filter by status' }))
  expect(screen.getByLabelText('Status')).toHaveFocus()
})

test('shows an error with retry', async () => {
  const user = userEvent.setup()
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: { message: 'Server down' } }) })
  mount()
  expect(await screen.findByText("Couldn't load requests")).toBeInTheDocument()
  reply(fixture)
  await user.click(screen.getByRole('button', { name: /Retry/ }))
  await tab(/Needs you, 1/)
})

test('empty state per role', async () => {
  reply([])
  const first = mount()
  expect(await screen.findByText("You haven't requested any work yet.")).toBeInTheDocument()
  // The header already offers the only link, so the empty state does not repeat it.
  expect(screen.getAllByRole('link', { name: 'Find an artisan' }).map((a) => a.getAttribute('href'))).toEqual(['/artisans'])
  first.unmount()

  auth = { me: { role: 'artisan' } }
  reply([])
  const second = mount()
  expect(await screen.findByText('No requests yet. Homeowners find you in the directory.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Edit your profile' })).toHaveAttribute('href', '/workspace/profile')
  second.unmount()

  reply([])
  mount('/requests?status=rejected')
  expect(await screen.findByText('No requests with this status.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Clear filter' })).toBeInTheDocument()
})

test('falls back to Former Fixly user', async () => {
  reply([view('gone', 'pending', { participants: { homeowner: person('Owner'), artisan: { id: 'a', name: null, avatar: null } } })])
  mount()
  expect(await screen.findByRole('link', { name: /Former Fixly user/ })).toBeInTheDocument()
})
