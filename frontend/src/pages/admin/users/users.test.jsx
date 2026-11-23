import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ToastProvider } from '../../../components/ui/index.js'
import UsersList from './UsersList.jsx'
import UserDetail from './UserDetail.jsx'

vi.mock('../../../auth/useAuth.js', () => ({ useAuth: () => ({ me: { id: 'me', role: 'admin' } }) }))

const base = { id: 'u1', firstName: 'Ada', lastName: 'Obi', email: 'ada@example.com', role: 'house_owner', isDeleted: false, createdAt: '2026-01-01T10:00:00Z', artisanProfile: null }

// routes: [[method, urlPart, response]]; the first match wins.
function mockFetch(routes) {
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET'
    const hit = routes.find(([m, part]) => m === method && String(url).includes(part))
    const [, , status = 200, body = {}] = hit ?? ['', '', 404, { message: 'nope' }]
    return { ok: status < 400, status, json: async () => body }
  })
}
const calls = (method) => globalThis.fetch.mock.calls.filter(([, i]) => (i?.method ?? 'GET') === method)

const Where = () => <p data-testid="search">{useLocation().search}</p>
function mount(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/admin/users" element={<><UsersList /><Where /></>} />
            <Route path="/admin/users/:id" element={<UserDetail />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}
const detail = (user) => ['GET', '/admin/user/u1', 200, { data: user }]

test('include deleted toggle sets the URL', async () => {
  mockFetch([['GET', '/admin/users', 200, { data: [base], meta: { totalPages: 1 } }]])
  mount('/admin/users')
  await screen.findByText('ada@example.com')
  await userEvent.click(screen.getByLabelText('Include deleted'))
  expect(screen.getByTestId('search')).toHaveTextContent('includeDeleted=true')
  await waitFor(() => expect(globalThis.fetch.mock.calls.at(-1)[0]).toContain('includeDeleted=true'))
})

test('role change confirm sends role and a LAST_ADMIN 409 shows the message', async () => {
  mockFetch([
    ['PATCH', '/admin/user/u1', 409, { message: 'x', code: 'LAST_ADMIN' }],
    detail({ ...base, role: 'admin' }),
  ])
  mount('/admin/users/u1')
  await screen.findByRole('heading', { name: 'Ada Obi' })
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Role' }), 'house_owner')
  await userEvent.click(screen.getByRole('button', { name: 'Change role' }))
  expect(await screen.findByText("Change Ada Obi's role to Homeowner?")).toBeInTheDocument()
  await userEvent.click(screen.getAllByRole('button', { name: 'Change role' }).at(-1))
  expect(await screen.findByText('Fixly needs at least one active admin.')).toBeInTheDocument()
  const [, init] = calls('PATCH')[0]
  expect(JSON.parse(init.body)).toEqual({ role: 'house_owner' })
})

test('hard delete stays disabled until the email is typed, then sends DELETE', async () => {
  mockFetch([['DELETE', '/admin/user/u1', 200, {}], detail(base), ['GET', '/admin/users', 200, { data: [], meta: {} }]])
  mount('/admin/users/u1')
  await screen.findByRole('heading', { name: 'Ada Obi' })
  await userEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
  const confirm = screen.getAllByRole('button', { name: 'Delete permanently' }).at(-1)
  expect(confirm).toBeDisabled()
  await userEvent.type(screen.getByLabelText(/Type/), 'ada@example.com')
  expect(confirm).toBeEnabled()
  await userEvent.click(confirm)
  await waitFor(() => expect(calls('DELETE')).toHaveLength(1))
  await screen.findByText('Users')
})

test('restore shows only for deactivated users', async () => {
  mockFetch([detail({ ...base, isDeleted: true, deletedAt: '2026-02-01T00:00:00Z' })])
  const first = mount('/admin/users/u1')
  await screen.findByRole('heading', { name: 'Ada Obi' })
  expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument()
  first.unmount()

  mockFetch([detail(base)])
  mount('/admin/users/u1')
  await screen.findByRole('heading', { name: 'Ada Obi' })
  expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
})
