import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useParams } from 'react-router'
import { StageSteps } from '../../components/progress/index.js'
import { ErrorState, LinkButton, PageHeader, Panel, Skeleton, SkeletonPanel, StatusBadge } from '../../components/ui/index.js'
import { useAuth } from '../../auth/useAuth.js'
import { api, ApiError } from '../../lib/api.js'
import { queryKeys } from '../../lib/queryClient.js'
import { deadlineFor, statusMeta } from '../../lib/requestStatus.js'
import { useCountdown } from '../../lib/useCountdown.js'
import { useDocumentTitle } from '../../layouts/useDocumentTitle.js'
import FactsRail from './panels/FactsRail.jsx'
import { otherSide, personOf } from './panels/format.js'
import History from './panels/History.jsx'
import StagePanel from './panels/StagePanel.jsx'
import { useRequestAction } from './useRequestAction.js'

const HEADER = 'mb-0! lg:mb-0!'
const BACK = (
  <LinkButton to="/requests" variant="tertiary">
    <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
    Back to requests
  </LinkButton>
)

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading request" className="flex flex-col gap-6">
      <div aria-hidden="true" className="flex flex-col items-start gap-3">
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-6 w-24" />
      </div>
      <Panel><Skeleton className="h-12 w-full" /></Panel>
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
        <Panel className="lg:col-span-8"><SkeletonPanel lines={4} /></Panel>
        <Panel className="lg:col-span-4"><SkeletonPanel lines={6} /></Panel>
      </div>
    </div>
  )
}

const titleOf = (view, role) => `${personOf(view, otherSide(role)).name}: ${statusMeta(view.status).label}`

function Loaded({ view, role, refetch, renderActionForm }) {
  const mutation = useRequestAction(view.id)
  const { label, tone } = statusMeta(view.status)
  const deadline = deadlineFor(view)
  const title = titleOf(view, role)
  useCountdown(deadline, { onExpire: refetch })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        summary={view.description ? <span className="line-clamp-2">{view.description}</span> : null}
        actions={BACK}
        className={HEADER}
      >
        <div className="mt-3"><StatusBadge tone={tone}>{label}</StatusBadge></div>
      </PageHeader>
      <Panel aria-label="Progress">
        <StageSteps status={view.status} view={view} deadline={deadline} />
      </Panel>
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-x-8">
        <div className="lg:col-span-8 lg:col-start-1">
          <StagePanel view={view} role={role} mutation={mutation} renderActionForm={renderActionForm} />
        </div>
        <div className="self-start lg:sticky lg:top-6 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1">
          <FactsRail view={view} />
        </div>
        <div className="lg:col-span-8 lg:col-start-1">
          <History view={view} />
        </div>
      </div>
    </div>
  )
}

// renderActionForm(action, mutation) is the hook for actions that take typed input.
export default function RequestDetail({ renderActionForm }) {
  const { id } = useParams()
  const { me } = useAuth()
  const query = useQuery({
    queryKey: queryKeys.request(id),
    queryFn: ({ signal }) => api(`/service-requests/${id}`, { signal }),
    refetchOnWindowFocus: true,
  })
  useDocumentTitle(query.data ? titleOf(query.data.data, me?.role) : 'Request')

  if (query.isPending) return <DetailSkeleton />
  if (query.isError) {
    const status = query.error instanceof ApiError ? query.error.status : 0
    if (status === 404 || status === 400) {
      return (
        <div className="flex flex-col gap-6">
          <PageHeader title="Request not found" className={HEADER} />
          <Panel>
            <div className="flex flex-col items-start gap-4">
              <p className="max-w-[60ch] text-fg-2">{"This request doesn't exist or isn't yours."}</p>
              <LinkButton to="/requests" variant="secondary">Back to requests</LinkButton>
            </div>
          </Panel>
        </div>
      )
    }
    return (
      <Panel>
        <ErrorState
          headingLevel={1}
          title="Couldn't load this request"
          message={query.error.message}
          onRetry={() => query.refetch()}
          retrying={query.isFetching}
        />
      </Panel>
    )
  }
  return (
    <Loaded
      view={query.data.data}
      role={me?.role}
      refetch={() => query.refetch()}
      renderActionForm={renderActionForm}
    />
  )
}
