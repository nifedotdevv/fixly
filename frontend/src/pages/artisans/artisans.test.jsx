import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import Directory from './Directory.jsx'
import Detail from './Detail.jsx'

let auth = { me: null, status: 'signed-out' }
vi.mock('../../auth/useAuth.js', () => ({ useAuth: () => auth }))

const profile = (over = {}) => ({
  id: 'p1',
  profession: 'Plumber',
  professional_headline: 'Pipes and taps',
  skills: ['tiling'],
  city: 'ikeja',
  serviceAreas: ['yaba'],
  experience_years: 8,
  starting_price: 15000,
  isAvailable: true,
  user_id: { id: 'u1', firstName: 'Tunde', lastName: 'Bello', avatar: null },
  ratingSummary: { count: 0, average: null },
  ...over,
})

function reply(status, json) {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => json })
}
const list = (data, totalPages = 3) => reply(200, { data, meta: { total: data.length, page: 1, limit: 10, totalPages } })

const Where = () => <p data-testid="search">{useLocation().search}</p>
function mount(ui, path, route) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={route} element={<>{ui}<Where /></>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => { auth = { me: null, status: 'signed-out' } })

test('filters write to the URL and reset the page', async () => {
  const user = userEvent.setup()
  list([profile()])
  mount(<Directory />, '/artisans?page=2', '/artisans')
  await screen.findByText('Tunde Bello')
  await user.selectOptions(screen.getByLabelText('Profession'), 'Plumber')
  await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('?profession=Plumber'))
  expect(screen.getByTestId('search')).not.toHaveTextContent('page=')
  await user.click(screen.getByRole('button', { name: 'Next' }))
  await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('page=2'))
  await user.type(screen.getByLabelText('Skill'), 'tiling{Enter}')
  await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent('skill=tiling'))
  expect(screen.getByTestId('search')).not.toHaveTextContent('page=')
  expect(screen.getByRole('link', { name: /Tunde Bello/ })).toHaveAttribute('href', '/artisans/p1')
})

test('zero reviews show text and no stars; reviews show the average; away shows a badge', async () => {
  list([
    profile(),
    profile({ id: 'p2', user_id: { id: 'u2', firstName: 'Ngozi', lastName: 'Eze' }, isAvailable: false, ratingSummary: { count: 12, average: 4.6 } }),
  ])
  const { container } = mount(<Directory />, '/artisans', '/artisans')
  await screen.findByText('Ngozi Eze')
  const [first, second] = screen.getAllByRole('listitem')
  expect(first).toHaveTextContent('No reviews yet')
  expect(first.querySelector('.lucide-star')).toBeNull()
  expect(first).not.toHaveTextContent('Away')
  expect(second).toHaveTextContent('4.6 (12 reviews)')
  expect(second.querySelector('.lucide-star')).not.toBeNull()
  expect(second).toHaveTextContent('Away')
  expect(container).toHaveTextContent('Ikeja, Yaba')
})

test('empty and 400 states', async () => {
  list([], 1)
  const { unmount } = mount(<Directory />, '/artisans?skill=x', '/artisans')
  expect(await screen.findByText('No artisans match these filters.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
  await waitFor(() => expect(screen.getByTestId('search')).toHaveTextContent(/^$/))
  unmount()
  reply(400, { message: 'skill must not exceed 60 characters' })
  mount(<Directory />, '/artisans', '/artisans')
  expect(await screen.findByRole('alert')).toHaveTextContent('skill must not exceed 60 characters')
})

const detail = (over) => reply(200, { data: profile(over) })
const open = () => mount(<Detail />, '/artisans/p1', '/artisans/:profileId')

test('detail: signed out goes to register', async () => {
  detail()
  open()
  const link = await screen.findByRole('link', { name: 'Request an inspection' })
  expect(link).toHaveAttribute('href', '/register?role=house_owner&next=/artisans/p1/request')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tunde Bello')
  expect(screen.getByText('8 years’ experience')).toBeInTheDocument()
})

test('detail: homeowner links to the request form', async () => {
  auth = { me: { role: 'house_owner', emailVerified: true }, status: 'signed-in' }
  detail()
  open()
  expect(await screen.findByRole('link', { name: 'Request an inspection' })).toHaveAttribute('href', '/artisans/p1/request')
})

test('detail: unverified homeowner sees the note', async () => {
  auth = { me: { role: 'house_owner', emailVerified: false }, status: 'signed-in' }
  detail()
  open()
  expect(await screen.findByText('Verify your email to send requests.')).toBeInTheDocument()
})

test('detail: artisan sees no button', async () => {
  auth = { me: { role: 'artisan' }, status: 'signed-in' }
  detail()
  open()
  await screen.findByRole('heading', { level: 1 })
  expect(screen.queryByText('Request an inspection')).toBeNull()
})

test('detail: away artisan disables the button for a homeowner', async () => {
  auth = { me: { role: 'house_owner', emailVerified: true }, status: 'signed-in' }
  detail({ isAvailable: false })
  open()
  expect(await screen.findByRole('button', { name: 'Request an inspection' })).toBeDisabled()
  expect(screen.getByText('Not taking requests right now')).toBeInTheDocument()
})

test('detail: 404 shows the unlisted state', async () => {
  reply(404, { message: 'Artisan profile not found' })
  open()
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('This artisan isn’t listed right now')
  expect(screen.getByRole('link', { name: 'Back to the directory' })).toHaveAttribute('href', '/artisans')
})
