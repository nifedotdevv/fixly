import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Hourglass, Inbox } from 'lucide-react'
import {
  Button, EmptyState, ErrorState, FilterBar, LinkButton, PageHeader, Pagination, Panel, Select, SkeletonRows, Tabs,
} from '../../components/ui/index.js'
import { useAuth } from '../../auth/useAuth.js'
import { api } from '../../lib/api.js'
import { queryKeys } from '../../lib/queryClient.js'
import { deadlineFor, REQUEST_STATUSES, statusMeta, turnGroup } from '../../lib/requestStatus.js'
import { useDocumentTitle } from '../../layouts/useDocumentTitle.js'
import RequestRow, { ROW_COLUMNS } from './RequestRow.jsx'

const LIMIT = 100
const FINISHED_COLLAPSED = 10
const TABS = [
  { value: 'needs-you', label: 'Needs you', icon: Inbox, empty: 'Nothing needs you right now.' },
  { value: 'waiting', label: 'Waiting', icon: Hourglass, empty: 'Nothing is waiting on the other side.' },
  { value: 'finished', label: 'Finished', icon: CheckCircle2, empty: 'No finished jobs yet.' },
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

const COLUMN_HEADS = ['Request', 'Status', 'Next deadline', 'Amount']

function RowList({ rows, role }) {
  return (
    <>
      <div
        aria-hidden="true"
        className={`hidden border-b border-border px-6 py-2 text-caption text-muted lg:grid lg:gap-6 ${ROW_COLUMNS}`}
      >
        {COLUMN_HEADS.map((h, i) => <span key={h} className={i === 3 ? 'text-right' : undefined}>{h}</span>)}
      </div>
      <ul>
        {rows.map((view) => <RequestRow key={view.id} view={view} role={role} />)}
      </ul>
    </>
  )
}

function TabPanel({ tab, rows, role, collapsible }) {
  const [showAll, setShowAll] = useState(false)
  const hidden = collapsible && !showAll && rows.length > FINISHED_COLLAPSED
  const shown = hidden ? rows.slice(0, FINISHED_COLLAPSED) : rows
  return (
    <div className="flex flex-col gap-4">
      <Panel flush>
        {rows.length
          ? <RowList rows={shown} role={role} />
          : <EmptyState icon={tab.icon} message={tab.empty} />}
      </Panel>
      {hidden && (
        <div>
          <Button variant="secondary" onClick={() => setShowAll(true)}>Show all finished ({rows.length})</Button>
        </div>
      )}
    </div>
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

  // Replacing the whole query string drops a stale `tab` (and `page` when clearing).
  function setStatus(value) {
    setSp(value ? { status: value } : {})
  }
  const clearFilter = () => setSp({})

  const rows = query.data?.data ?? []
  const total = query.data?.meta?.total ?? rows.length
  const totalPages = query.data?.meta?.totalPages ?? 1

  let body
  let summary = ''
  if (query.isPending) body = <Panel flush><SkeletonRows count={4} /></Panel>
  else if (query.isError) {
    body = <Panel><ErrorState title="Couldn't load requests" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isFetching} /></Panel>
  } else if (!rows.length) {
    let empty
    if (status) {
      empty = <EmptyState icon={Inbox} message="No requests with this status." action={<Button variant="secondary" onClick={clearFilter}>Clear filter</Button>} />
    } else if (role === 'artisan') {
      empty = <EmptyState icon={Inbox} message="No requests yet. Homeowners find you in the directory." action={<LinkButton to="/workspace/profile" variant="secondary">Edit your profile</LinkButton>} />
    } else {
      empty = <EmptyState icon={Inbox} message="You haven't requested any work yet." />
    }
    body = <Panel flush>{empty}</Panel>
  } else if (status) {
    summary = `${total} ${total === 1 ? 'request' : 'requests'}`
    body = (
      <>
        <Panel flush><RowList rows={rows} role={role} /></Panel>
        <Pagination page={page} totalPages={totalPages} onChange={(p) => setSp({ status, page: String(p) })} />
      </>
    )
  } else {
    const now = new Date()
    const grouped = { 'needs-you': [], waiting: [], finished: [] }
    for (const view of rows) grouped[turnGroup(view, role, now)].push(view)
    for (const key of Object.keys(grouped)) grouped[key].sort(byUrgency)
    const needs = grouped['needs-you'].length
    summary = needs ? `${needs} ${needs === 1 ? 'request needs' : 'requests need'} you` : 'Nothing needs you right now'
    const defaultValue = needs ? 'needs-you' : (grouped.waiting.length || !grouped.finished.length ? 'waiting' : 'finished')
    const items = TABS.map(({ value, label }) => ({ value, label, count: grouped[value].length }))
    body = (
      <>
        <Tabs param="tab" label="Request groups" items={items} defaultValue={defaultValue}>
          {(active) => {
            const tab = TABS.find((t) => t.value === active)
            return <TabPanel tab={tab} rows={grouped[active]} role={role} collapsible={active === 'finished'} />
          }}
        </Tabs>
        {total > LIMIT && (
          <p className="text-caption text-fg-2">
            Showing your {LIMIT} most recent requests.{' '}
            <button type="button" className="link" onClick={() => document.getElementById('status-filter')?.focus()}>
              Filter by status
            </button>{' '}
            to find older ones.
          </p>
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Requests"
        summary={summary}
        className="mb-0! lg:mb-0!"
        actions={
          <>
            <FilterBar label="Request filters" onClear={clearFilter} canClear={Boolean(status)}>
              <div className="flex items-center gap-2">
                <label htmlFor="status-filter" className="shrink-0 text-small font-medium text-fg">Status</label>
                <Select id="status-filter" className="h-10!" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">All</option>
                  {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}
                </Select>
              </div>
            </FilterBar>
            {role === 'house_owner' && <LinkButton to="/artisans" className="h-10!">Find an artisan</LinkButton>}
          </>
        }
      />
      {body}
    </div>
  )
}
