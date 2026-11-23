import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { EmptyState, ErrorState, Pagination, StatusBadge } from '../../../components/ui/index.js'
import { api } from '../../../lib/api.js'
import { queryKeys } from '../../../lib/queryClient.js'
import { statusMeta } from '../../../lib/requestStatus.js'
import { formatDateTime } from '../../../lib/time.js'
import { useDocumentTitle } from '../../../layouts/useDocumentTitle.js'
import { CopyId, SupportNav, TableSkeleton } from './shared.jsx'
import { PAGE_SIZE, TD, TH, excerpt, pageOf } from './format.js'

export default function ProblemsQueue() {
  useDocumentTitle('Reported problems')
  const [sp, setSp] = useSearchParams()
  const page = pageOf(sp)
  const params = { page, limit: PAGE_SIZE }
  const query = useQuery({
    queryKey: queryKeys.adminProblems(params),
    queryFn: ({ signal }) => api('/admin/support/requests', { query: params, signal }),
  })
  const rows = query.data?.data ?? []
  const totalPages = query.data?.meta?.totalPages ?? 1

  let body
  if (query.isPending) body = <TableSkeleton />
  else if (query.isError) {
    body = <ErrorState title="Couldn't load problems" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isFetching} />
  } else if (!rows.length) body = <EmptyState message="No problems waiting." />
  else {
    const { label, tone } = statusMeta('problem_reported')
    body = (
      <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse">
            <caption className="sr-only">Reported problems, newest first</caption>
            <thead>
              <tr className="border-b border-border-strong">
                <th scope="col" className={TH}>Reported</th>
                <th scope="col" className={TH}>Problem</th>
                <th scope="col" className={TH}>Homeowner</th>
                <th scope="col" className={TH}>Artisan</th>
                <th scope="col" className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-b border-border">
                  <td className={`${TD} tabular whitespace-nowrap`}>{r.problem?.reportedAt ? formatDateTime(r.problem.reportedAt) : ''}</td>
                  <td className={`${TD} max-w-[28rem]`}>
                    <Link to={`/admin/support/problems/${r._id}`} className="underline underline-offset-2 hover:text-accent">
                      {excerpt(r.problem?.explanation) || 'Open problem'}
                    </Link>
                  </td>
                  <td className={TD}><CopyId id={r.homeowner} label="homeowner id" /></td>
                  <td className={TD}><CopyId id={r.artisan} label="artisan id" /></td>
                  <td className={TD}><StatusBadge tone={tone}>{label}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="mt-6">
            <Pagination page={page} totalPages={totalPages} onChange={(p) => setSp({ page: String(p) })} />
          </div>
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6 py-6">
      <h1>Support</h1>
      <SupportNav />
      <div aria-live="polite" className="min-w-0">{body}</div>
    </div>
  )
}
