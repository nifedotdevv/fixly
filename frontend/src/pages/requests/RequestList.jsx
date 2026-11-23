import { useId, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Button, EmptyState, ErrorState, LinkButton, Pagination, Select, Skeleton } from '../../components/ui/index.js'
import { useAuth } from '../../auth/useAuth.js'
import { api } from '../../lib/api.js'
import { queryKeys } from '../../lib/queryClient.js'
import { deadlineFor, REQUEST_STATUSES, statusMeta, turnGroup } from '../../lib/requestStatus.js'
import { useDocumentTitle } from '../../layouts/useDocumentTitle.js'
import RequestRow from './RequestRow.jsx'

const LIMIT = 100
const FINISHED_COLLAPSED = 10
const GROUPS = [
  { key: 'needs-you', title: 'Needs you', count: true },
  { key: 'waiting', title: 'Waiting on the other side' },
  { key: 'finished', title: 'Finished' },
]

const at = (iso) => new Date(iso).getTime()

function byUrgency(a, b) {
  const da = deadlineFor(a)
  const db = deadlineFor(b)
  if (da && db && at(da) !== at(db)) return at(da) - at(db)
  if (da && !db) return -1
  if (!da && db) return 1
  return at(b.updatedAt) - at(a.updatedAt)
}

function Skeletons() {
  return (
    <div aria-hidden="true" className="flex flex-col">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-4 border-b border-border py-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-6 w-32" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  )
}

function Group({ title, count, rows, role, collapsible }) {
  const [showAll, setShowAll] = useState(false)
  const headingId = useId()
  if (!rows.length) return null
  const hidden = collapsible && !showAll && rows.length > FINISHED_COLLAPSED
  const shown = hidden ? rows.slice(0, FINISHED_COLLAPSED) : rows
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId}>
        {title}
        {count && <span className="tabular text-fg-2"> ({rows.length})</span>}
      </h2>
      <ul className="border-t border-border">
        {shown.map((view) => <RequestRow key={view.id} view={view} role={role} />)}
      </ul>
      {hidden && (
        <div>
          <Button variant="secondary" onClick={() => setShowAll(true)}>Show all finished ({rows.length})</Button>
        </div>
      )}
    </section>
  )
}

export default function RequestList() {
  useDocumentTitle('Requests')
  const { me } = useAuth()
  const role = me?.role
  const [sp, setSp] = useSearchParams()
  const rawStatus = sp.get('status')
  const status = REQUEST_STATUSES.includes(rawStatus) ? rawStatus : ''
  const page = Math.max(1, Number.parseInt(sp.get('page') ?? '', 10) || 1)

  const params = status ? { status, page } : { limit: LIMIT }
  const query = useQuery({
    queryKey: queryKeys.requests(params),
    queryFn: ({ signal }) => api('/service-requests', { query: params, signal }),
    refetchOnWindowFocus: true,
  })

  function setStatus(value) {
    setSp(value ? { status: value } : {})
  }
  const clearFilter = () => setSp({})

  const rows = query.data?.data ?? []
  const total = query.data?.meta?.total ?? rows.length
  const totalPages = query.data?.meta?.totalPages ?? 1

  let body
  let summary = ''
  if (query.isPending) body = <Skeletons />
  else if (query.isError) {
    body = <ErrorState title="Couldn't load requests" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isFetching} />
  } else if (!rows.length) {
    if (status) {
      body = <EmptyState message="No requests with this status." action={<Button variant="secondary" onClick={clearFilter}>Clear filter</Button>} />
    } else if (role === 'artisan') {
      body = <EmptyState message="No requests yet. Homeowners find you in the directory." action={<LinkButton to="/workspace/profile" variant="secondary">Edit your profile</LinkButton>} />
    } else {
      body = <EmptyState message="You haven't requested any work yet." action={<LinkButton to="/artisans">Find an artisan</LinkButton>} />
    }
  } else if (status) {
    summary = `${total} ${total === 1 ? 'request' : 'requests'}`
    body = (
      <>
        <ul className="border-t border-border">
          {rows.map((view) => <RequestRow key={view.id} view={view} role={role} />)}
        </ul>
        <div className="mt-6">
          <Pagination page={page} totalPages={totalPages} onChange={(p) => setSp({ status, page: String(p) })} />
        </div>
      </>
    )
  } else {
    const now = new Date()
    const grouped = { 'needs-you': [], waiting: [], finished: [] }
    for (const view of rows) grouped[turnGroup(view, role, now)].push(view)
    const needs = grouped['needs-you'].length
    summary = needs ? `${needs} ${needs === 1 ? 'request needs' : 'requests need'} you` : 'Nothing needs you right now'
    body = (
      <div className="flex flex-col gap-8">
        {GROUPS.map(({ key, title, count }) => (
          <Group key={key} title={title} count={count} rows={grouped[key].sort(byUrgency)} role={role} collapsible={key === 'finished'} />
        ))}
        {total > LIMIT && (
          <p className="text-caption text-fg-2">
            Showing your {LIMIT} most recent requests.{' '}
            <button type="button" className="underline" onClick={() => document.getElementById('status-filter')?.focus()}>
              Filter by status
            </button>{' '}
            to find older ones.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1>Requests</h1>
        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-caption text-fg-2">Status</label>
          <Select id="status-filter" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}
          </Select>
        </div>
      </div>
      <div className="min-w-0">
        <p aria-live="polite" className="tabular mb-2 text-caption text-fg-2">{summary}</p>
        {body}
      </div>
    </div>
  )
}
