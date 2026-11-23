import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { ToastProvider } from '../../components/ui/index.js'
import WorkspaceProfile from './Profile.jsx'

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }

let me = { id: 'u1', role: 'artisan', emailVerified: true }
vi.mock('../../auth/useAuth.js', () => ({ useAuth: () => ({ me }) }))

const existing = {
  _id: 'p1', professional_headline: 'Licensed plumber', profession: 'Plumber', experience_years: 5, starting_price: 15000,
  city: 'lagos', serviceAreas: ['ikeja'], skills: ['pipes'], phone_number: '08012345678',
  residential_address: '12 Allen Ave', office_address: '3 Broad St', isAvailable: true, ratingSummary: { count: 0, average: null },
}
const res = (status, json) => ({ ok: status < 400, status, json: async () => json })

// routes: map of "METHOD path" -> response (or function returning one)
function mockFetch(routes) {
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url.replace('/api/v1', '')}`
    const r = routes[key]
    return typeof r === 'function' ? r() : r ?? res(500, { message: `unmocked ${key}` })
  })
}
const bodyOf = (method) => JSON.parse(fetch.mock.calls.find(([, i]) => i?.method === method)[1].body)

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/workspace/profile']}>
          <Routes>
            <Route path="/workspace/profile" element={<WorkspaceProfile />} />
            <Route path="/requests" element={<p>requests page</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => { me = { id: 'u1', role: 'artisan', emailVerified: true } })

test('a 404 shows create mode and POSTs every field without user_id or rating', async () => {
  const user = userEvent.setup()
  mockFetch({ 'GET /artisan/profile/me': res(404, { message: 'Artisan profile not found' }), 'POST /artisan/profile': res(201, { data: {} }) })
  setup()
  expect(await screen.findByRole('heading', { level: 1, name: 'Set up your artisan profile' })).toBeInTheDocument()
  expect(screen.getByText('Homeowners see this in the directory.')).toBeInTheDocument()
  await user.type(screen.getByLabelText('Headline'), 'Licensed plumber')
  await user.selectOptions(screen.getByLabelText('Profession'), 'Plumber')
  await user.type(screen.getByLabelText('Years of experience'), '5')
  await user.type(screen.getByLabelText('Starting price'), '15000')
  await user.type(screen.getByLabelText('City'), 'Lagos')
  await user.type(screen.getByLabelText('Service areas'), 'Ikeja,')
  await user.type(screen.getByLabelText('Skills'), 'Pipes,')
  await user.type(screen.getByLabelText('Phone number'), '08012345678')
  await user.type(screen.getByLabelText('Home address'), '12 Allen Ave')
  await user.type(screen.getByLabelText('Work address'), '3 Broad St')
  await user.click(screen.getByRole('button', { name: 'Create profile' }))
  expect(await screen.findByText('requests page')).toBeInTheDocument()
  const body = bodyOf('POST')
  expect(body).toEqual({
    professional_headline: 'Licensed plumber', profession: 'Plumber', experience_years: 5, starting_price: 15000,
    city: 'Lagos', serviceAreas: ['ikeja'], skills: ['pipes'], phone_number: '08012345678',
    residential_address: '12 Allen Ave', office_address: '3 Broad St', isAvailable: true,
  })
  expect(body).not.toHaveProperty('user_id')
  expect(body).not.toHaveProperty('rating')
})

test('edit mode PATCHes only the changed fields and stays disabled until a change', async () => {
  const user = userEvent.setup()
  mockFetch({ 'GET /artisan/profile/me': res(200, { data: existing }), 'PATCH /artisan/profile/p1': res(200, { data: existing }) })
  setup()
  expect(await screen.findByRole('heading', { level: 1, name: 'Your artisan profile' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'View public profile' })).toHaveAttribute('href', '/artisans/p1')
  const save = screen.getByRole('button', { name: 'Save changes' })
  expect(save).toBeDisabled()
  const price = screen.getByLabelText('Starting price')
  await user.clear(price)
  await user.type(price, '20000')
  await user.type(screen.getByLabelText('Skills'), 'Welding,')
  await user.click(save)
  await waitFor(() => expect(bodyOf('PATCH')).toEqual({ starting_price: 20000, skills: ['pipes', 'welding'] }))
  expect(await screen.findByText('Changes saved')).toBeInTheDocument()
})

test('the availability switch rolls back when the save fails', async () => {
  const user = userEvent.setup()
  mockFetch({ 'GET /artisan/profile/me': res(200, { data: existing }), 'PATCH /artisan/profile/p1': res(500, { message: 'Server broke' }) })
  setup()
  const toggle = await screen.findByRole('switch', { name: 'Taking new requests' })
  expect(toggle).toBeChecked()
  await user.click(toggle)
  expect(bodyOf('PATCH')).toEqual({ isAvailable: false })
  expect(await screen.findByText('Server broke')).toBeInTheDocument()
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Taking new requests' })).toBeChecked())
})

test('an unverified artisan sees the hidden-profile notice', async () => {
  me = { id: 'u1', role: 'artisan', emailVerified: false }
  mockFetch({ 'GET /artisan/profile/me': res(200, { data: existing }) })
  setup()
  expect(await screen.findByText('Your profile is hidden from the directory until you verify your email.')).toBeInTheDocument()
})
