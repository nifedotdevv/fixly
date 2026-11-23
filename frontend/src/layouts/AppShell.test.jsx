import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { expect, test, vi } from 'vitest'
import { AuthContext } from '../auth/auth-context.js'
import { ToastProvider } from '../components/ui/index.js'
import AppShell from './AppShell.jsx'

function setup(role, path, signOut = vi.fn()) {
  const me = { id: '1', firstName: 'Ada', lastName: 'Obi', email: 'a@b.co', role, emailVerified: true }
  render(
    <ToastProvider>
      <AuthContext.Provider value={{ me, signOut }}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AppShell maxWidth="max-w-[1120px]" />}>
              <Route path="*" element={<h1>Page</h1>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </ToastProvider>,
  )
  return { signOut }
}

const navs = () => [screen.getByTestId('nav-sidebar'), screen.getByTestId('nav-tabs')]

test.each([
  ['house_owner', ['Requests', 'Find an artisan']],
  ['artisan', ['Requests', 'My profile']],
  ['admin', ['Users', 'Problems', 'Payments']],
])('%s sees its nav items with icons in both navs', (role, labels) => {
  setup(role, '/x')
  for (const nav of navs()) {
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(labels)
    for (const l of links) expect(l.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument()
  }
})

test.each([
  ['/requests/12', 'Requests'],
  ['/admin/support/problems/3', 'Problems'],
])('%s keeps %s active', (path, label) => {
  setup(path.startsWith('/admin') ? 'admin' : 'artisan', path)
  for (const nav of navs()) {
    expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getAllByRole('link').filter((l) => l.hasAttribute('aria-current'))).toHaveLength(1)
  }
})

test.each([
  ['house_owner', 'New request', '/artisans'],
  ['artisan', 'Edit profile', '/workspace/profile'],
])('%s sidebar shows the %s action', (role, label, href) => {
  setup(role, '/x')
  const link = within(screen.getByRole('complementary')).getByRole('link', { name: label })
  expect(link).toHaveAttribute('href', href)
})

test('admin sidebar has no main action', () => {
  setup('admin', '/x')
  const links = within(screen.getByRole('complementary')).getAllByRole('link').map((l) => l.textContent)
  expect(links).toEqual(['Fixly', 'Users', 'Problems', 'Payments'])
})

test('sidebar account block shows the name and role', () => {
  setup('artisan', '/x')
  const trigger = within(screen.getByRole('complementary')).getByRole('button', { name: 'Account menu' })
  expect(trigger).toHaveTextContent('Ada Obi')
  expect(trigger).toHaveTextContent('Artisan')
})

test('account menu opens and Sign out calls signOut', async () => {
  const { signOut } = setup('artisan', '/x')
  await userEvent.click(screen.getAllByRole('button', { name: 'Account menu' })[0])
  expect(await screen.findByRole('menuitem', { name: 'Account' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
  expect(signOut).toHaveBeenCalled()
})

test('skip link is the first focusable element and main exists', async () => {
  setup('admin', '/x')
  await userEvent.tab()
  expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveFocus()
  expect(document.querySelector('main#main')).toHaveAttribute('tabindex', '-1')
})

test('active sidebar item uses the soft fill and aria-current', () => {
  setup('artisan', '/requests/12')
  const link = within(screen.getByTestId('nav-sidebar')).getByRole('link', { name: 'Requests' })
  expect(link).toHaveAttribute('aria-current', 'page')
  expect(link).toHaveClass('bg-lime-soft')
  expect(link).not.toHaveClass('bg-lime')
})

test('the shell marks <html> while its bottom tab bar exists, so toasts lift only then', () => {
  expect(document.documentElement).not.toHaveAttribute('data-has-tabbar')
  const { unmount } = render(
    <AuthContext.Provider value={{ me: { id: '1', firstName: 'Ada', lastName: 'Obi', email: 'a@b.co', role: 'artisan', emailVerified: true }, signOut: vi.fn() }}>
      <MemoryRouter>
        <Routes>
          <Route element={<AppShell maxWidth="max-w-[1120px]" />}>
            <Route path="*" element={<h1>Page</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
  expect(document.documentElement).toHaveAttribute('data-has-tabbar')
  unmount()
  expect(document.documentElement).not.toHaveAttribute('data-has-tabbar')
})
