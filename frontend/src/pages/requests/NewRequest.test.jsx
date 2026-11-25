import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import NewRequest from './NewRequest.jsx'
import { ToastProvider } from '../../components/ui/index.js'

let auth
vi.mock('../../auth/useAuth.js', () => ({ useAuth: () => auth }))

const OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
const profile = (over = {}) => ({
  id: 'p1', profession: 'Plumber', starting_price: 15000, isAvailable: true,
  user_id: { _id: 'u1', id: 'u1', firstName: 'Tunde', lastName: 'Bello', avatar: null }, ...over,
})
const res = (status, json) => ({ ok: status < 400, status, json: async () => json })

function setup(profileData, post) {
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    if (init.method === 'POST' && url.includes('/service-requests')) return post()
    return res(200, { data: profileData })
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/artisans/p1/request']}>
          <Routes>
            <Route path="/artisans/:profileId/request" element={<NewRequest />} />
            <Route path="/requests/:id" element={<p>Request page</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

const pad = (n) => String(n).padStart(2, '0')
const local = (ms) => {
  const d = new Date(Date.now() + ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const postCall = () => globalThis.fetch.mock.calls.find(([, i]) => i?.method === 'POST')

async function fill({ deadline } = {}) {
  const user = userEvent.setup()
  await screen.findByLabelText('What needs fixing?')
  await user.type(screen.getByLabelText('What needs fixing?'), 'Leaking tap')
  await user.type(screen.getByLabelText('Service address'), '12 Allen Avenue')
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: local(3 * 24 * 3600000) } })
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: local(3 * 24 * 3600000 + 2 * 3600000) } })
  if (deadline) fireEvent.change(screen.getByLabelText('Reply needed by'), { target: { value: deadline } })
  return user
}

beforeEach(() => { auth = { me: { role: 'house_owner', emailVerified: true, email: 'a@b.co' }, status: 'signed-in' } })

test('posts the user id with offset timestamps and navigates', async () => {
  setup(profile(), () => res(201, { data: { id: 'r9' } }))
  const user = await fill()
  expect(screen.getByLabelText('Reply needed by').value).not.toBe('')
  await user.click(screen.getByRole('button', { name: 'Send request' }))
  await screen.findByText('Request page')
  const body = JSON.parse(postCall()[1].body)
  expect(body.artisan).toBe('u1')
  expect(Object.keys(body).sort()).toEqual(['artisan', 'description', 'inspectionWindow', 'responseDeadline', 'serviceAddress'])
  for (const t of [body.inspectionWindow.start, body.inspectionWindow.end, body.responseDeadline]) expect(t).toMatch(OFFSET)
})

test('blocks a deadline after the inspection start', async () => {
  setup(profile(), () => res(201, { data: { id: 'r9' } }))
  const user = await fill({ deadline: local(4 * 24 * 3600000) })
  await user.click(screen.getByRole('button', { name: 'Send request' }))
  expect(await screen.findByText('Reply time must be no later than the inspection start.')).toBeInTheDocument()
  expect(postCall()).toBeUndefined()
})

test('a start too soon for any reply is explained on the start, not as a reply error', async () => {
  setup(profile(), () => res(201, { data: { id: 'r9' } }))
  const user = userEvent.setup()
  await screen.findByLabelText('What needs fixing?')
  await user.type(screen.getByLabelText('What needs fixing?'), 'Leaking tap')
  await user.type(screen.getByLabelText('Service address'), '12 Allen Avenue')
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: local(13 * 60000) } })
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: local(73 * 60000) } })
  // The suggested reply time never lands after the start.
  expect(new Date(screen.getByLabelText('Reply needed by').value).getTime())
    .toBeLessThanOrEqual(new Date(screen.getByLabelText('Starts').value).getTime())
  await user.click(screen.getByRole('button', { name: 'Send request' }))
  expect(await screen.findByText('Start at least 15 minutes from now, so the artisan has time to reply.')).toBeInTheDocument()
  expect(screen.queryByText(/^Reply time must/)).toBeNull()
  expect(postCall()).toBeUndefined()
})

test('shows the verify notice on 403 and keeps values', async () => {
  setup(profile(), () => res(403, { code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email address before performing this action.' }))
  const user = await fill()
  await user.click(screen.getByRole('button', { name: 'Send request' }))
  expect(await screen.findByText(/Verify your email/)).toBeInTheDocument()
  expect(screen.getByLabelText('What needs fixing?')).toHaveValue('Leaking tap')
  expect(screen.getByLabelText('Service address')).toHaveValue('12 Allen Avenue')
})

test('shows the unavailable message on 409 ARTISAN_UNAVAILABLE', async () => {
  setup(profile(), () => res(409, { code: 'ARTISAN_UNAVAILABLE', message: 'x' }))
  const user = await fill()
  await user.click(screen.getByRole('button', { name: 'Send request' }))
  expect(await screen.findByText("This artisan isn't taking requests right now.")).toBeInTheDocument()
  expect(screen.getByLabelText('Service address')).toHaveValue('12 Allen Avenue')
})

test('an away artisan shows no form', async () => {
  setup(profile({ isAvailable: false }), () => res(201, {}))
  expect(await screen.findByText('Not taking requests right now')).toBeInTheDocument()
  await waitFor(() => expect(screen.queryByLabelText('Service address')).not.toBeInTheDocument())
})
