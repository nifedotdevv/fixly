import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { SearchX, SlidersHorizontal } from 'lucide-react'
import { Avatar, Badge, Button, DataRow, Dialog, EmptyState, ErrorState, PageHeader, Pagination, Panel, SkeletonRows } from '../../components/ui/index.js'
import { api } from '../../lib/api.js'
import { queryKeys } from '../../lib/queryClient.js'
import { useDocumentTitle } from '../../layouts/useDocumentTitle.js'
import Filters from './Filters.jsx'
import { Profession, Rating } from './shared.jsx'
import { fromPrice, fullName, placeLine, profileId } from './helpers.js'

const PAGE_SIZE = 10
const SORTS = ['createdAt', 'experience_years', 'starting_price']

function readParams(sp) {
  const page = Number.parseInt(sp.get('page') ?? '', 10)
  return {
    search: sp.get('search') ?? '',
    profession: sp.get('profession') ?? '',
    skill: sp.get('skill') ?? '',
    area: sp.get('area') ?? '',
    available: sp.get('available') === 'true',
    sortBy: SORTS.includes(sp.get('sortBy')) ? sp.get('sortBy') : 'createdAt',
    order: sp.get('order') === 'asc' ? 'asc' : 'desc',
    page: page > 0 ? page : 1,
  }
}

const activeCount = (v) => ['search', 'profession', 'skill', 'area'].filter((k) => v[k]).length + (v.available ? 1 : 0)

const COLUMNS = 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_9rem]'

function Row({ p }) {
  const name = fullName(p)
  const price = fromPrice(p)
  const place = placeLine(p)
  return (
    <DataRow
      to={`/artisans/${profileId(p)}`}
      columns={COLUMNS}
      className="flex-wrap items-start py-4 lg:flex-nowrap lg:items-center"
    >
      <DataRow.Cell className="order-1 flex flex-1 items-center gap-3 lg:flex-none">
        <Avatar src={p.user_id?.avatar?.url} role="artisan" name={name} size={40} decorative />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium break-words">{name}</span>
            {p.isAvailable === false && <Badge>Away</Badge>}
          </span>
          <span className="text-small text-fg-2"><Profession name={p.profession} /></span>
        </span>
      </DataRow.Cell>
      <DataRow.Cell className="order-3 basis-full pl-[52px] text-small text-fg-2 break-words lg:order-none lg:basis-auto lg:pl-0">
        {place || <span className="text-muted">No area listed</span>}
      </DataRow.Cell>
      <DataRow.Cell className="order-4 basis-full pl-[52px] text-small lg:order-none lg:basis-auto lg:pl-0">
        <Rating summary={p.ratingSummary} />
      </DataRow.Cell>
      <DataRow.Cell numeric align="end" className="order-2 shrink-0 font-medium">
        {price}
      </DataRow.Cell>
    </DataRow>
  )
}

export default function Directory() {
  useDocumentTitle('Find an artisan')
  const [sp, setSp] = useSearchParams()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [clearKey, setClearKey] = useState(0)
  const values = readParams(sp)

  const params = {
    search: values.search,
    profession: values.profession,
    skill: values.skill,
    area: values.area,
    available: values.available ? 'true' : '',
    sortBy: values.sortBy,
    order: values.order,
    page: values.page,
    limit: PAGE_SIZE,
  }
  const query = useQuery({ queryKey: queryKeys.artisans(params), queryFn: ({ signal }) => api('/artisan/profiles', { query: params, signal }) })

  // Any filter change goes back to page 1; only Pagination sets a page.
  function change(updates) {
    setSp((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(updates)) {
        if (v === '' || v == null || v === false) next.delete(k)
        else next.set(k, v)
      }
      if (!('page' in updates)) next.delete('page')
      return next
    })
  }
  const clear = () => {
    setClearKey((k) => k + 1)
    setSp(new URLSearchParams())
  }

  const badRequest = query.error?.status === 400 ? query.error.message : ''
  const count = activeCount(values)
  const rows = query.data?.data ?? []
  const totalPages = query.data?.meta?.totalPages ?? 1
  const filters = <Filters resetKey={clearKey} values={values} onChange={change} error={badRequest} onClear={count ? clear : undefined} />

  const total = query.data?.meta?.total ?? rows.length
  const resultsLine = query.isSuccess && !badRequest ? `${total} ${total === 1 ? 'artisan' : 'artisans'}` : ''

  let results
  if (query.isPending) results = <Panel flush><SkeletonRows count={4} /></Panel>
  else if (badRequest) results = null
  else if (query.isError) results = <Panel><ErrorState title="Couldn't load artisans" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isFetching} /></Panel>
  else if (!rows.length) {
    results = <Panel flush><EmptyState icon={SearchX} message="No artisans match these filters." action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} /></Panel>
  } else {
    results = (
      <>
        <Panel flush><ul>{rows.map((p) => <Row key={profileId(p)} p={p} />)}</ul></Panel>
        <Pagination page={values.page} totalPages={totalPages} onChange={(page) => change({ page: String(page) })} />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Find an artisan"
        summary={resultsLine}
        className="mb-0! lg:mb-0!"
        actions={
          <div className="lg:hidden">
            <Dialog
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              title="Filters"
              trigger={
                <Button variant="secondary">
                  <SlidersHorizontal size={16} strokeWidth={1.75} aria-hidden="true" />
                  Filters ({count})
                </Button>
              }
            >
              {filters}
              <Button className="mt-6 w-full" onClick={() => setSheetOpen(false)}>
                {query.isSuccess && !badRequest ? `Show ${resultsLine}` : 'Show results'}
              </Button>
            </Dialog>
          </div>
        }
      />
      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:items-start lg:gap-8">
        <Panel title="Filters" className="hidden lg:sticky lg:top-6 lg:block lg:self-start">
          {filters}
        </Panel>
        <div className="flex min-w-0 flex-col gap-6">{results}</div>
      </div>
    </div>
  )
}
