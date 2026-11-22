import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ToastProvider } from '../../components/ui/index.js'
import { queryClient, queryKeys } from '../../lib/queryClient.js'
import Account from './Account.jsx'

const me = { id: 'u1', firstName: 'Ada', lastName: 'Obi', email: 'ada@example.com', role: 'house_owner', emailVerified: true, avatar: null }
vi.mock('../../auth/useAuth.js', () => ({ useAuth: () => ({ me }) }))
const clearSession = vi.fn()
vi.mock('../../lib/session.js', async (orig) => ({ ...(await orig()), clearSession: (...a) => clearSession(...a) }))

function reply(status, json = {}) {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => json })
}
const Where = () => {
  const l = useLocation()
  return <p>at {l.pathname}: {l.state?.notice}</p>
}
function setup() {
  queryClient.setQueryData(queryKeys.me(), { data: me })
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/account']}>
          <Routes>
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}
beforeEach(() => clearSession.mockClear())

test('a name save updates the me cache', async () => {
  const user = userEvent.setup()
  reply(200, { data: { firstName: 'Adaeze', lastName: 'Obi' } })
  setup()
  const first = screen.getByLabelText('First name')
  await user.clear(first)
  await user.type(first, 'Adaeze')
  await user.click(screen.getByRole('button', { name: 'Save name' }))
  await waitFor(() => expect(queryClient.getQueryData(queryKeys.me()).data.firstName).toBe('Adaeze'))
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/users/u1')
  expect(fetch.mock.calls[0][1].method).toBe('PATCH')
  expect(await screen.findByText('Saved')).toBeInTheDocument()
})

test('a 6MB avatar is rejected before upload', async () => {
  const user = userEvent.setup()
  reply(200)
  setup()
  const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' })
  await user.upload(screen.getByLabelText('Choose a photo'), big)
  expect(await screen.findByText('That photo is over 5 MB. Choose a smaller one.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled()
  expect(fetch).not.toHaveBeenCalled()
})

const section = (name) => within(screen.getByRole('region', { name }))

test('a password change clears the session and goes to login', async () => {
  const user = userEvent.setup()
  reply(200, {})
  setup()
  const pw = section('Password')
  await user.type(pw.getByLabelText('Current password'), 'OldPassw0rd!')
  await user.type(pw.getByLabelText('New password'), 'NewPassw0rd!')
  await user.click(pw.getByRole('button', { name: 'Change password' }))
  expect(await screen.findByText('at /login: Password changed. Sign in again.')).toBeInTheDocument()
  expect(clearSession).toHaveBeenCalled()
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    currentPassword: 'OldPassw0rd!', password: 'NewPassw0rd!', confirmPassword: 'NewPassw0rd!',
  })
})

test('delete with open bookings keeps the dialog open with the 409 message', async () => {
  const user = userEvent.setup()
  reply(409, { message: 'Account has unresolved service requests' })
  setup()
  await user.click(screen.getByRole('button', { name: 'Delete account' }))
  const dialog = await screen.findByRole('alertdialog')
  await user.type(within(dialog).getByLabelText('Password'), 'OldPassw0rd!')
  await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }))
  expect(await within(dialog).findByText(/Finish or cancel your open jobs first/)).toBeInTheDocument()
  expect(within(dialog).getByRole('link', { name: 'See your requests' })).toHaveAttribute('href', '/requests')
  expect(within(dialog).getByLabelText('Password')).toHaveValue('OldPassw0rd!')
  expect(clearSession).not.toHaveBeenCalled()
})

test('sign out on all devices confirms, clears the session and goes to login', async () => {
  const user = userEvent.setup()
  reply(200, {})
  setup()
  await user.click(screen.getByRole('button', { name: 'Sign out on all devices' }))
  const dialog = await screen.findByRole('alertdialog')
  await user.click(within(dialog).getByRole('button', { name: 'Sign out on all devices' }))
  expect(await screen.findByText('at /login: Signed out on all devices.')).toBeInTheDocument()
  expect(fetch.mock.calls[0][0]).toBe('/api/v1/auth/logout-all')
  expect(clearSession).toHaveBeenCalled()
})

test('another 409 on delete shows the server message', async () => {
  const user = userEvent.setup()
  reply(409, { message: 'Another account lifecycle operation is in progress' })
  setup()
  await user.click(screen.getByRole('button', { name: 'Delete account' }))
  const dialog = await screen.findByRole('alertdialog')
  await user.type(within(dialog).getByLabelText('Password'), 'OldPassw0rd!')
  await user.click(within(dialog).getByRole('button', { name: 'Delete my account' }))
  expect(await within(dialog).findByText(/Another account lifecycle operation/)).toBeInTheDocument()
  expect(within(dialog).queryByText(/open jobs/)).not.toBeInTheDocument()
})
