import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { Tape } from '../../components/tape/index.js'
import { ConflictNotice, EmptyState, ErrorState, LinkButton, Skeleton, StatusBadge } from '../../components/ui/index.js'
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

function DetailSkeleton() {
  return (
    <div role="status" aria-label="Loading request" className="flex flex-col gap-6">
      <Skeleton className="h-8 w-2/3 max-w-md" />
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-6 lg:grid-cols-12">
        <Skeleton className="h-48 lg:col-span-8" />
        <Skeleton className="h-64 lg:col-span-4" />
      </div>
    </div>
  )
}

function Loaded({ view, role, refetch, renderActionForm }) {
  const mutation = useRequestAction(view.id)
  const { name } = personOf(view, otherSide(role))
  const { label, tone } = statusMeta(view.status)
  const deadline = deadlineFor(view)
  const title = `${name}: ${label}`
  useDocumentTitle(title)
  useCountdown(deadline, { onExpire: refetch })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-2">
        <h1 className="break-words">{title}</h1>
        <StatusBadge tone={tone}>{label}</StatusBadge>
      </div>
      <Tape status={view.status} view={view} deadline={deadline} />
      <div className="grid gap-6 lg:grid-cols-12 lg:gap-x-8">
        <div className="flex flex-col gap-4 lg:col-span-8 lg:col-start-1">
          {mutation.conflict && <ConflictNotice />}
          <StagePanel view={view} role={role} mutation={mutation} renderActionForm={renderActionForm} />
        </div>
        <div className="lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1">
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
  useDocumentTitle('Request')

  if (query.isPending) return <DetailSkeleton />
  if (query.isError) {
    const status = query.error instanceof ApiError ? query.error.status : 0
    if (status === 404 || status === 400) {
      return (
        <EmptyState
          message="This request doesn't exist or isn't yours."
          action={<LinkButton to="/requests" variant="secondary">Back to requests</LinkButton>}
        />
      )
    }
    return (
      <ErrorState
        headingLevel={1}
        title="Couldn't load this request"
        message={query.error.message}
        onRetry={() => query.refetch()}
        retrying={query.isFetching}
      />
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
