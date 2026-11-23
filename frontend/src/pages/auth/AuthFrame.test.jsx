import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, test, vi } from 'vitest'
import Login from './Login.jsx'
import Register from './Register.jsx'
import ForgotPassword from './ForgotPassword.jsx'
import ResetPassword from './ResetPassword.jsx'
import Reactivate from './Reactivate.jsx'

vi.mock('../../auth/useAuth.js', () => ({ useAuth: () => ({ signIn: vi.fn() }) }))

const PAGES = { Login, Register, ForgotPassword, ResetPassword, Reactivate }

describe.each(Object.entries(PAGES))('%s frame', (_name, Page) => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    )

  test('renders exactly one h1', () => {
    renderPage()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  test('gradient half is desktop-only, hidden from assistive tech and inert', () => {
    renderPage()
    const column = screen.getByTestId('auth-preview-column')
    expect(column).toHaveClass('hidden', 'lg:flex')
    expect(column).toHaveAttribute('aria-hidden', 'true')
    expect(column.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0)
  })
})
