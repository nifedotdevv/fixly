import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Inbox } from 'lucide-react'
import {
  DataRow, EmptyState, ErrorState, PageHeader, Pagination, Panel, SkeletonRows, StatusBadge,
} from '../../../components/ui/index.js'
import { api } from '../../../lib/api.js'
import { queryKeys } from '../../../lib/queryClient.js'
import { statusMeta } from '../../../lib/requestStatus.js'
import { formatDateTime } from '../../../lib/time.js'
import { useDocumentTitle } from '../../../layouts/useDocumentTitle.js'
import { PAGE_SIZE, excerpt, pageOf } from './format.js'

const COLUMNS = 'lg:grid-cols-[minmax(0,1fr)_10rem_14rem]'
const HEADS = ['Problem', 'Status', 'Reported']

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

  const total = query.data?.meta?.total ?? rows.length
  const summary = query.isSuccess ? `${total} ${total === 1 ? 'problem' : 'problems'} waiting` : ''

  let body
  if (query.isPending) body = <Panel flush><SkeletonRows compact count={6} /></Panel>
  else if (query.isError) {
    body = <Panel><ErrorState title="Couldn't load problems" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isFetching} /></Panel>
  } else if (!rows.length) body = <Panel flush><EmptyState icon={Inbox} message="No problems waiting." /></Panel>
  else {
    const { label, tone } = statusMeta('problem_reported')
    body = (
      <>
        <Panel flush>
          <div
            aria-hidden="true"
            className={`hidden border-b border-border px-6 py-2 text-caption text-muted lg:grid lg:gap-6 ${COLUMNS}`}
          >
            {HEADS.map((h, i) => <span key={h} className={i === HEADS.length - 1 ? 'text-right' : undefined}>{h}</span>)}
          </div>
          <ul aria-label="Reported problems">
            {rows.map((r) => (
              <DataRow compact key={r._id} to={`/admin/support/problems/${r._id}`} columns={COLUMNS} className="flex-wrap">
                <DataRow.Cell className="order-1 min-w-0 basis-full truncate font-medium lg:basis-auto">
                  {excerpt(r.problem?.explanation) || 'Open problem'}
                </DataRow.Cell>
                <DataRow.Cell className="order-2 lg:order-none"><StatusBadge tone={tone}>{label}</StatusBadge></DataRow.Cell>
                <DataRow.Cell numeric align="end" className="order-3 ms-auto text-fg-2 lg:order-none lg:ms-0 lg:text-fg">
                  {r.problem?.reportedAt ? formatDateTime(r.problem.reportedAt) : ''}
                </DataRow.Cell>
              </DataRow>
            ))}
          </ul>
        </Panel>
        {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={(p) => setSp({ page: String(p) })} />}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Problems" summary={summary} className="mb-0! lg:mb-0!" />
      {body}
    </div>
  )
}
