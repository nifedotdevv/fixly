import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import Login from './Login.jsx'
import Register from './Register.jsx'

const signIn = vi.fn()
vi.mock('../../auth/useAuth.js', () => ({ useAuth: () => ({ signIn }) }))

function reply(status, json) {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => json })
}
const Where = () => <p>at {useLocation().pathname}</p>
const renderAt = (url, ui) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/login" element={ui} />
        <Route path="/register" element={ui} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => signIn.mockClear())

test('login success signs in and navigates to next', async () => {
  const user = userEvent.setup()
  const data = { id: '1', token: 'tok', role: 'artisan' }
  reply(200, { data })
  renderAt('/login?next=/requests', <Login />)
  await user.type(screen.getByLabelText('Email'), 'a@b.com')
  await user.type(screen.getByLabelText('Password'), 'secret')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('at /requests')).toBeInTheDocument()
  expect(signIn).toHaveBeenCalledWith('tok', data)
})

test('login 401 shows the message and keeps values', async () => {
  const user = userEvent.setup()
  reply(401, { message: 'Invalid email or password' })
  renderAt('/login', <Login />)
  await user.type(screen.getByLabelText('Email'), 'a@b.com')
  await user.type(screen.getByLabelText('Password'), 'secret')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByText('Email or password is incorrect')).toBeInTheDocument()
  expect(screen.getByLabelText('Email')).toHaveValue('a@b.com')
  expect(screen.getByRole('link', { name: /forgot your password/i })).toHaveAttribute('href', '/forgot-password')
})

async function fillRegister(user) {
  await user.type(screen.getByLabelText('First name'), 'Ada')
  await user.type(screen.getByLabelText('Last name'), 'Obi')
  await user.type(screen.getByLabelText('Email'), 'ada@b.com')
  await user.type(screen.getByLabelText('Password'), 'Abcdefghi1')
  await user.click(screen.getByRole('button', { name: 'Create account' }))
}

test('register 409 with isDeactivated shows the days', async () => {
  const user = userEvent.setup()
  reply(409, { message: 'x', data: { isDeactivated: true, daysRemaining: 12 } })
  renderAt('/register', <Register />)
  await fillRegister(user)
  expect(await screen.findByText('Still recoverable for 12 days')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Reactivate it' })).toHaveAttribute('href', '/reactivate')
})

test('register 201 shows the inbox message and preserves next', async () => {
  const user = userEvent.setup()
  reply(201, { data: {} })
  renderAt('/register?role=artisan&next=/requests', <Register />)
  expect(screen.getByRole('radio', { name: 'I do the work' })).toBeChecked()
  await fillRegister(user)
  expect(await screen.findByText('Check your inbox to verify your email, then sign in.')).toBeInTheDocument()
  expect(JSON.parse(fetch.mock.calls[0][1].body).role).toBe('artisan')
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?next=%2Frequests')
})

test('password rule hints update', async () => {
  const user = userEvent.setup()
  renderAt('/register', <Register />)
  const rules = screen.getByRole('list', { name: 'Password rules' })
  expect(rules).toHaveTextContent('A number (not met)')
  await user.type(screen.getByLabelText('Password'), 'Abcdefghi1')
  expect(rules).toHaveTextContent('A number (met)')
  expect(rules).toHaveTextContent('10 or more characters (met)')
  await user.click(screen.getByLabelText('Password'))
  await user.paste('é'.repeat(40))
  expect(rules).toHaveTextContent('72 bytes or fewer (not met)')
})

test('login shows a notice passed in router state', () => {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state: { notice: 'Password changed. Sign in with the new one.' } }]}>
      <Login />
    </MemoryRouter>,
  )
  expect(screen.getByText('Password changed. Sign in with the new one.')).toBeInTheDocument()
})
