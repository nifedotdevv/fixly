import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Avatar, EmptyState, ErrorState, Pagination, Skeleton } from '../../../components/ui/index.js'
import { api } from '../../../lib/api.js'
import { queryKeys } from '../../../lib/queryClient.js'
import { useDocumentTitle } from '../../../layouts/useDocumentTitle.js'
import { formatDate, fullName, isVerified, roleLabel, statusLabel, userId } from './helpers.js'

const LIMIT = 20
const TH = 'px-3 py-2 text-left font-medium text-fg-2 whitespace-nowrap'
const TD = 'h-10 px-3 whitespace-nowrap'

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <h1>Users</h1>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => update({ includeDeleted: e.target.checked ? 'true' : null, page: null })}
            className="size-4 accent-accent"
          />
          Include deleted
        </label>
      </div>
      <p className="text-caption text-fg-2 max-w-[60ch]">
        Fixly has no user search or account creation. People register themselves.
      </p>

      {q.isPending ? (
        <div aria-hidden="true" className="flex flex-col gap-1">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : q.isError ? (
        <ErrorState title="Couldn't load users" message={q.error.message} onRetry={() => q.refetch()} retrying={q.isFetching} />
      ) : users.length === 0 ? (
        <EmptyState message="No users to show." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[44rem] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className={TH}>Name</th>
                  <th scope="col" className={TH}>Email</th>
                  <th scope="col" className={TH}>Role</th>
                  <th scope="col" className={TH}>Verified</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const id = userId(u)
                  const name = fullName(u)
                  return (
                    <tr key={id} className="border-b border-border last:border-b-0 hover:bg-surface-inset">
                      <td className={TD}>
                        <Link to={`/admin/users/${id}`} className="flex items-center gap-2 font-medium">
                          <Avatar src={u.avatar?.url} role={u.role} name={name} size={32} decorative />
                          {name}
                        </Link>
                      </td>
                      <td className={TD}>{u.email}</td>
                      <td className={TD}>{roleLabel(u.role)}</td>
                      <td className={TD}>{isVerified(u) ? 'Yes' : 'No'}</td>
                      <td className={TD}>{statusLabel(u)}</td>
                      <td className={`${TD} tabular`}>{formatDate(u.createdAt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onChange={(p) => update({ page: p === 1 ? null : String(p) })} />
          )}
        </>
      )}
    </div>
  )
}
