import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { AuthContext } from '../auth/auth-context.js'
import { ToastProvider } from '../components/ui/index.js'
import VerifyBanner from './VerifyBanner.jsx'

const json = (status, body) => ({ ok: status < 400, status, json: async () => body })

function setup(me, response) {
  const fetchMock = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetchMock)
  render(
    <ToastProvider>
      <AuthContext.Provider value={{ me }}>
        <VerifyBanner />
      </AuthContext.Provider>
    </ToastProvider>,
  )
  return fetchMock
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test.each([[{ email: 'a@b.co', emailVerified: true }], [{ email: 'a@b.co' }]])('hidden when verified or legacy', (me) => {
  setup(me)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('shown when unverified', () => {
  setup({ email: 'a@b.co', emailVerified: false })
  expect(screen.getByRole('status')).toHaveTextContent(
    'Verify your email to send requests and appear in the directory. We sent a link to a@b.co.',
  )
  expect(screen.getByRole('button', { name: 'Resend link' })).toBeInTheDocument()
})

test('resend success toasts and starts a 60s cooldown', async () => {
  const fetchMock = setup({ email: 'a@b.co', emailVerified: false }, json(200, { message: 'ok' }))
  await userEvent.click(screen.getByRole('button', { name: 'Resend link' }))
  expect(await screen.findByText('Link sent to a@b.co')).toBeInTheDocument()
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('/api/v1/auth/resend-verification')
  expect(init.method).toBe('POST')
  expect(init.body).toBe('{}')
  const btn = screen.getByRole('button', { name: 'Sent' })
  expect(btn).toBeDisabled()
})

test('cooldown ends after 60s', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  setup({ email: 'a@b.co', emailVerified: false }, json(200, {}))
  await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Resend link' }))
  await screen.findByRole('button', { name: 'Sent' })
  act(() => vi.advanceTimersByTime(60_000))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Resend link' })).toBeEnabled())
})

test('429 shows the rate-limit message', async () => {
  setup({ email: 'a@b.co', emailVerified: false }, json(429, {}))
  await userEvent.click(screen.getByRole('button', { name: 'Resend link' }))
  expect(await screen.findByText('Too many attempts. Try again in 15 minutes.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Resend link' })).toBeEnabled()
})

test('503 shows the email-not-set-up message', async () => {
  setup({ email: 'a@b.co', emailVerified: false }, json(503, {}))
  await userEvent.click(screen.getByRole('button', { name: 'Resend link' }))
  expect(await screen.findByText("Email isn't set up on this server.")).toBeInTheDocument()
})
