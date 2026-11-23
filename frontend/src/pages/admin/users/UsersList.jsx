import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import {
  DataRow, EmptyState, ErrorState, FilterBar, PageHeader, Pagination, Panel, SkeletonRows,
} from '../../../components/ui/index.js'
import { api } from '../../../lib/api.js'
import { queryKeys } from '../../../lib/queryClient.js'
import { useDocumentTitle } from '../../../layouts/useDocumentTitle.js'
import { formatDate, fullName, isVerified, roleLabel, statusLabel, userId } from './helpers.js'

const LIMIT = 20
const COLUMNS = 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_6.5rem]'
const HEADS = ['Name', 'Email', 'Role', 'Email verified', 'Status', 'Created']

function UserRow({ user }) {
  const id = userId(user)
  return (
    <DataRow compact to={`/admin/users/${id}`} columns={COLUMNS} className="flex-wrap">
      <DataRow.Cell className="order-1 flex-1 truncate font-medium lg:flex-none">{fullName(user)}</DataRow.Cell>
      <DataRow.Cell className="order-3 basis-full truncate text-fg-2 lg:order-none lg:basis-auto lg:text-fg">{user.email}</DataRow.Cell>
      <DataRow.Cell className="order-4 truncate text-fg-2 lg:order-none lg:text-fg">{roleLabel(user.role)}</DataRow.Cell>
      <DataRow.Cell className="order-4 truncate text-fg-2 lg:order-none lg:text-fg">{isVerified(user) ? 'Email verified' : 'Email not verified'}</DataRow.Cell>
      <DataRow.Cell className="order-4 truncate text-fg-2 lg:order-none lg:text-fg">{statusLabel(user)}</DataRow.Cell>
      <DataRow.Cell numeric align="end" className="order-2 shrink-0 text-fg-2 lg:text-fg">{formatDate(user.createdAt)}</DataRow.Cell>
    </DataRow>
  )
}

export default function UsersList() {
  useDocumentTitle('Users')
  const [sp, setSp] = useSearchParams()
  const includeDeleted = sp.get('includeDeleted') === 'true'
  const raw = Number.parseInt(sp.get('page') ?? '', 10)
  const page = raw > 0 ? raw : 1
  const params = { page, limit: LIMIT, includeDeleted: includeDeleted ? 'true' : undefined }

  const q = useQuery({
    queryKey: queryKeys.adminUsers(params),
    queryFn: ({ signal }) => api('/admin/users', { query: params, signal }),
  })

  function update(next) {
    const copy = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === undefined) copy.delete(k)
      else copy.set(k, v)
    }
    setSp(copy)
  }

  const users = q.data?.data ?? []
  const totalPages = q.data?.meta?.totalPages ?? 1

  let body
  if (q.isPending) body = <Panel flush><SkeletonRows compact count={6} /></Panel>
  else if (q.isError) {
    body = <Panel><ErrorState title="Couldn't load users" message={q.error.message} onRetry={() => q.refetch()} retrying={q.isFetching} /></Panel>
  } else if (users.length === 0) {
    body = <Panel flush><EmptyState icon={Users} message="No users to show." /></Panel>
  } else {
    body = (
      <>
        <Panel flush>
          <div
            aria-hidden="true"
            className={`hidden border-b border-border px-6 py-2 text-caption text-muted lg:grid lg:gap-6 ${COLUMNS}`}
          >
            {HEADS.map((h, i) => <span key={h} className={i === HEADS.length - 1 ? 'text-right' : undefined}>{h}</span>)}
          </div>
          <ul aria-label="Users">
            {users.map((u) => <UserRow key={userId(u)} user={u} />)}
          </ul>
        </Panel>
        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} onChange={(p) => update({ page: p === 1 ? null : String(p) })} />
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        summary="Fixly has no user search or account creation. People register themselves."
        className="mb-0! lg:mb-0!"
      >
        <div className="mt-4">
          <FilterBar
            label="User filters"
            canClear={includeDeleted}
            onClear={() => update({ includeDeleted: null, page: null })}
          >
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(e) => update({ includeDeleted: e.target.checked ? 'true' : null, page: null })}
                className="size-4 accent-ink"
              />
              Include deleted
            </label>
          </FilterBar>
        </div>
      </PageHeader>
      {body}
    </div>
  )
}
