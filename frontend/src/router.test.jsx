import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import AuthProvider from './auth/AuthProvider.jsx'
import { ToastProvider } from './components/ui/index.js'
import { clearSession, expireSession, setToken } from './lib/session.js'
import AppRoutes from './router.jsx'

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

const json = (status, body) => ({ ok: status < 400, status, json: async () => body })

function mockApi({ role, profileStatus = 200 }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      if (String(url).includes('/users/me')) {
        return json(200, { data: { id: '1', firstName: 'Ada', lastName: 'Obi', email: 'a@b.co', role, avatar: null } })
      }
      if (String(url).includes('/artisan/profile/me')) {
        return profileStatus === 200 ? json(200, { data: { id: 'p' } }) : json(404, { message: 'Not found' })
      }
      return json(404, {})
    }),
  )
}

function renderAt(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
            <Where />
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => clearSession())
afterEach(() => {
  clearSession()
  vi.unstubAllGlobals()
})

test('signed out, /requests lands on login with next', async () => {
  renderAt('/requests')
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Frequests'))
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
})

test('an artisan visiting /admin/users sees the wrong-role page', async () => {
  mockApi({ role: 'artisan' })
  setToken('t')
  renderAt('/admin/users')
  expect(await screen.findByRole('heading', { name: 'This area is for admins' })).toBeInTheDocument()
  expect(screen.getByTestId('where')).toHaveTextContent('/admin/users')
})

test('an admin /dashboard goes to /admin/users', async () => {
  mockApi({ role: 'admin' })
  setToken('t')
  renderAt('/dashboard')
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/admin/users'))
  expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument()
})

test('an artisan with no profile goes to /workspace/profile', async () => {
  mockApi({ role: 'artisan', profileStatus: 404 })
  setToken('t')
  renderAt('/dashboard')
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/workspace/profile'))
})

test('an artisan with a profile goes to /requests', async () => {
  mockApi({ role: 'artisan' })
  setToken('t')
  renderAt('/dashboard')
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/requests'))
})

test('every layout has a skip link first', async () => {
  renderAt('/')
  const link = await screen.findByRole('link', { name: 'Skip to main content' })
  expect(link).toHaveAttribute('href', '#main')
  expect(document.getElementById('main')).toHaveAttribute('tabindex', '-1')
})

test('signed-in users are sent away from /login', async () => {
  mockApi({ role: 'house_owner' })
  setToken('t')
  renderAt('/login')
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/requests'))
})

test('session expiry on a protected page lands on login with expired=1', async () => {
  mockApi({ role: 'artisan' })
  setToken('t')
  renderAt('/requests')
  await screen.findByRole('heading', { name: 'Requests' })
  act(() => expireSession())
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login?next=%2Frequests&expired=1'))
})

test('signing out from the account menu goes to the home page', async () => {
  const user = userEvent.setup()
  mockApi({ role: 'artisan' })
  setToken('t')
  renderAt('/requests')
  await user.click(await screen.findByRole('button', { name: 'Account menu' }))
  await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
  await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/))
})
