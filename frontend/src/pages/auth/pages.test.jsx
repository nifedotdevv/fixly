import { StrictMode } from 'react'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AuthContext } from '../../auth/auth-context.js'
import { ToastProvider } from '../../components/ui/index.js'
import * as session from '../../lib/session.js'
import useFragmentToken from './useFragmentToken.js'
import VerifyEmail from './VerifyEmail.jsx'
import ResetPassword from './ResetPassword.jsx'
import ForgotPassword from './ForgotPassword.jsx'

const TOKEN = 'a1'.repeat(32)
const json = (status, body = {}) => ({ ok: status < 400, status, json: async () => body })

function Login() {
  const { state } = useLocation()
  return <p>login notice: {state?.notice}</p>
}

function renderPage(ui, { me = null } = {}) {
  return render(
    <StrictMode>
      <QueryClientProvider client={new QueryClient()}>
        <AuthContext.Provider value={{ me, status: me ? 'signed-in' : 'signed-out', signOut: () => {} }}>
          <ToastProvider>
            <MemoryRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="*" element={ui} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    </StrictMode>,
  )
}

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => vi.unstubAllGlobals())

test('useFragmentToken strips the hash and rejects a malformed token', () => {
  window.history.replaceState(null, '', `/verify-email?x=1#token=${TOKEN}`)
  const good = renderHook(() => useFragmentToken())
  expect(good.result.current).toBe(TOKEN)
  expect(window.location.hash).toBe('')
  expect(window.location.pathname + window.location.search).toBe('/verify-email?x=1')

  window.history.replaceState(null, '', '/verify-email#token=nothex')
  const bad = renderHook(() => useFragmentToken())
  expect(bad.result.current).toBeNull()
  expect(window.location.hash).toBe('')
})

test('VerifyEmail posts exactly once and shows success', async () => {
  window.history.replaceState(null, '', `/verify-email#token=${TOKEN}`)
  const fetchMock = vi.fn(async () => json(200, { message: 'ok' }))
  vi.stubGlobal('fetch', fetchMock)
  renderPage(<VerifyEmail />)
  expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: TOKEN })
  expect(screen.getByRole('link', { name: 'Continue' })).toHaveAttribute('href', '/login')
})

test('VerifyEmail shows the invalid state on 400', async () => {
  window.history.replaceState(null, '', `/verify-email#token=${TOKEN}`)
  vi.stubGlobal('fetch', vi.fn(async () => json(400, { message: 'Invalid' })))
  renderPage(<VerifyEmail />)
  expect(await screen.findByRole('heading', { name: 'This link is invalid or has expired' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
})

test('ResetPassword success clears the session and navigates with a notice', async () => {
  const user = userEvent.setup()
  window.history.replaceState(null, '', `/reset-password#token=${TOKEN}`)
  const fetchMock = vi.fn(async () => json(200, {}))
  vi.stubGlobal('fetch', fetchMock)
  const clear = vi.spyOn(session, 'clearSession')
  renderPage(<ResetPassword />)
  await user.type(await screen.findByLabelText('New password'), 'Abcdefghi1')
  await user.type(screen.getByLabelText('Confirm new password'), 'Abcdefghi1')
  await user.click(screen.getByRole('button', { name: 'Change password' }))
  expect(await screen.findByText('login notice: Password changed. Sign in with the new one.')).toBeInTheDocument()
  expect(clear).toHaveBeenCalled()
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    token: TOKEN, password: 'Abcdefghi1', confirmPassword: 'Abcdefghi1',
  })
})

test('ForgotPassword always shows the neutral message', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('fetch', vi.fn(async () => json(200, {})))
  renderPage(<ForgotPassword />)
  await user.type(screen.getByLabelText('Email'), 'nobody@example.com')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  await waitFor(() =>
    expect(screen.getByText('If that address has an account, a link is on its way. Check your inbox.')).toBeInTheDocument(),
  )
})
