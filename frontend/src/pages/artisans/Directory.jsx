import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { SlidersHorizontal } from 'lucide-react'
import { Avatar, Badge, Button, Dialog, EmptyState, ErrorState, Pagination, Skeleton } from '../../components/ui/index.js'
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

function Row({ p }) {
  const name = fullName(p)
  const price = fromPrice(p)
  const place = placeLine(p)
  return (
    <li className="border-b border-border">
      <Link
        to={`/artisans/${profileId(p)}`}
        className="flex items-start gap-3 py-4 hover:bg-surface-inset sm:gap-4 sm:px-2"
      >
        <Avatar src={p.user_id?.avatar?.url} role="artisan" name={name} size={40} decorative />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium break-words">{name}</span>
            {p.isAvailable === false && <Badge>Away</Badge>}
          </div>
          <span className="text-caption text-fg-2"><Profession name={p.profession} /></span>
          {place && <span className="text-caption text-fg-2 break-words">{place}</span>}
          <span className="text-caption"><Rating summary={p.ratingSummary} /></span>
        </div>
        {price && <span className="tabular shrink-0 text-right font-medium">{price}</span>}
      </Link>
    </li>
  )
}

function Skeletons() {
  return (
    <div aria-hidden="true" className="flex flex-col">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-4 border-b border-border py-4">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
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
  const query = useQuery({ queryKey: queryKeys.artisans(params), queryFn: ({ signal }) => api('/artisans', { query: params, signal }) })

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
  const filters = <Filters key={clearKey} values={values} onChange={change} error={badRequest} />

  let results
  if (query.isPending) results = <Skeletons />
  else if (badRequest) results = null
  else if (query.isError) results = <ErrorState title="Couldn't load artisans" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isFetching} />
  else if (!rows.length) {
    results = <EmptyState message="No artisans match these filters." action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />
  } else {
    results = (
      <>
        <ul className="border-t border-border">{rows.map((p) => <Row key={profileId(p)} p={p} />)}</ul>
        <div className="mt-6">
          <Pagination page={values.page} totalPages={totalPages} onChange={(page) => change({ page: String(page) })} />
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6 py-6">
      <div className="flex items-center justify-between gap-4">
        <h1>Find an artisan</h1>
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
          </Dialog>
        </div>
      </div>
      <div className="lg:grid lg:grid-cols-[280px_1fr] lg:items-start lg:gap-8">
        <aside aria-label="Filters" className="sticky top-4 hidden max-h-[calc(100vh-2rem)] overflow-y-auto p-1 lg:block">
          {filters}
        </aside>
        <div aria-live="polite" className="min-w-0">{results}</div>
      </div>
    </div>
  )
}
