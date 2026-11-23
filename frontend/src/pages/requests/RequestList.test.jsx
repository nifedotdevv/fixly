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
const section = (name) => screen.getByRole('heading', { level: 2, name }).closest('section')
const hrefs = (el) => within(el).getAllByRole('link').map((a) => a.getAttribute('href'))

beforeEach(() => { auth = { me: { role: 'house_owner' } } })

test('homeowner and artisan see the same fixture grouped differently', async () => {
  reply(fixture)
  const first = mount()
  await screen.findByRole('heading', { level: 2, name: /Needs you/ })
  expect(globalThis.fetch.mock.calls[0][0]).toContain('limit=100')
  expect(hrefs(section(/Needs you/))).toEqual(['/requests/quote'])
  expect(section(/Needs you/)).toHaveTextContent('(1)')
  expect(hrefs(section('Waiting on the other side'))).toEqual(['/requests/pend-soon', '/requests/pend-late'])
  expect(hrefs(section('Finished'))).toEqual(['/requests/done'])
  first.unmount()

  auth = { me: { role: 'artisan' } }
  reply(fixture)
  mount()
  await screen.findByRole('heading', { level: 2, name: /Needs you/ })
  expect(hrefs(section(/Needs you/))).toEqual(['/requests/pend-soon', '/requests/pend-late'])
  expect(hrefs(section('Waiting on the other side'))).toEqual(['/requests/quote'])
})

test('rows show the other party, first line, money and deadline', async () => {
  reply(fixture)
  mount()
  const row = (await screen.findByRole('link', { name: /Artisan quote/ }))
  expect(row).toHaveTextContent('Job quote')
  expect(row).not.toHaveTextContent('second line')
  expect(row).toHaveTextContent('Quote ready')
  expect(row).toHaveTextContent('50,000')
  expect(row).toHaveTextContent('Ends')
})

test('status filter writes ?status= and shows a flat paginated list', async () => {
  const user = userEvent.setup()
  reply(fixture)
  mount()
  await screen.findByRole('heading', { level: 2, name: /Needs you/ })
  reply([view('p1', 'pending')], { totalPages: 2 })
  await user.selectOptions(screen.getByLabelText('Status'), 'pending')
  await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?status=pending'))
  await screen.findByRole('link', { name: /Artisan p1/ })
  expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument()
  expect(globalThis.fetch.mock.calls[0][0]).toContain('status=pending')
  expect(globalThis.fetch.mock.calls[0][0]).toContain('page=1')
  await user.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('page=2'))
})

test('collapses finished after 10 rows', async () => {
  const user = userEvent.setup()
  reply(Array.from({ length: 12 }, (_, i) => view(`f${i}`, 'cancelled')))
  mount()
  await screen.findByRole('heading', { level: 2, name: 'Finished' })
  expect(screen.getAllByRole('link')).toHaveLength(10)
  await user.click(screen.getByRole('button', { name: 'Show all finished (12)' }))
  expect(screen.getAllByRole('link')).toHaveLength(12)
})

test('empty state per role', async () => {
  reply([])
  const first = mount()
  expect(await screen.findByText("You haven't requested any work yet.")).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Find an artisan' })).toHaveAttribute('href', '/artisans')
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
