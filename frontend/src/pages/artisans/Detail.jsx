import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { Avatar, Badge, Button, ErrorState, LinkButton, Panel, Skeleton } from '../../components/ui/index.js'
import { api } from '../../lib/api.js'
import { queryKeys } from '../../lib/queryClient.js'
import { useAuth } from '../../auth/useAuth.js'
import { useDocumentTitle } from '../../layouts/useDocumentTitle.js'
import { ProfessionChip, Rating } from './shared.jsx'
import { fromPrice, fullName, titleCase } from './helpers.js'

function RequestAction({ profile, id }) {
  const { me, status } = useAuth()
  if (status === 'loading') return null
  if (me && me.role !== 'house_owner') return null
  const away = profile.isAvailable === false
  if (!me && !away) {
    return <LinkButton to={`/register?role=house_owner&next=/artisans/${id}/request`}>Request an inspection</LinkButton>
  }
  return (
    <div className="flex flex-col items-start gap-2">
      {away
        ? <Button disabled>Request an inspection</Button>
        : <LinkButton to={`/artisans/${id}/request`}>Request an inspection</LinkButton>}
      {away && <p className="text-caption text-fg-2">Not taking requests right now</p>}
      {me?.emailVerified === false && <p className="text-caption text-fg-2">Verify your email to send requests.</p>}
    </div>
  )
}

function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <Panel><div aria-hidden="true" className="flex items-start gap-4">
        <Skeleton className="size-16 shrink-0 rounded-full" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-5 w-72" />
        </div>
      </div></Panel>
    </div>
  )
}

function BackLink() {
  return (
    <div>
      <LinkButton to="/artisans" variant="tertiary">
        <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        Back to artisans
      </LinkButton>
    </div>
  )
}

function Fact({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Profile({ p, id }) {
  const name = fullName(p)
  const price = fromPrice(p)
  const years = p.experience_years
  const areas = [...new Set([p.city, ...(p.serviceAreas ?? [])].filter(Boolean).map(titleCase))]
  const reviewed = (p.ratingSummary?.count ?? 0) >= 1
  const away = p.isAvailable === false
  return (
    <div className="flex flex-col gap-6">
      <BackLink />
      <Panel as="header">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar src={p.user_id?.avatar?.url} role="artisan" name={name} size={64} decorative />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-h1 break-words">{name}</h1>
                {away && <Badge>Away</Badge>}
              </div>
              <span className="text-fg-2"><ProfessionChip name={p.profession} /></span>
              {areas.length > 0 && <span className="text-small text-fg-2 break-words">{areas.join(', ')}</span>}
              {reviewed && <span className="text-small"><Rating summary={p.ratingSummary} /></span>}
            </div>
          </div>
          <div className="[&_a]:w-full [&_button]:w-full sm:[&_a]:w-auto sm:[&_button]:w-auto sm:shrink-0">
            <RequestAction profile={p} id={id} />
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          <Panel title="About">
            {p.professional_headline && <p>{p.professional_headline}</p>}
            {years != null && (
              <p className="tabular mt-2 text-fg-2">{years} {years === 1 ? 'year’s' : 'years’'} experience</p>
            )}
          </Panel>
          {p.skills?.length > 0 && (
            <Panel title="Skills">
              <ul className="flex flex-wrap gap-2">
                {p.skills.map((s) => <li key={s}><Badge>{s}</Badge></li>)}
              </ul>
            </Panel>
          )}
          <Panel title="Reviews">
            <Rating summary={p.ratingSummary} />
          </Panel>
        </div>
        <Panel title="Facts" className="lg:col-span-4 lg:sticky lg:top-6 lg:self-start">
          <dl className="flex flex-col gap-4">
            {price && <Fact label="Price"><span className="tabular font-medium">{price}</span></Fact>}
            {areas.length > 0 && <Fact label="Works in">{areas.join(', ')}</Fact>}
            <Fact label="Availability">{away ? 'Away' : 'Available'}</Fact>
          </dl>
        </Panel>
      </div>
    </div>
  )
}

export default function Detail() {
  const { profileId } = useParams()
  const query = useQuery({ queryKey: queryKeys.artisan(profileId), queryFn: ({ signal }) => api(`/artisan/profile/${profileId}`, { signal }) })
  const p = query.data?.data
  useDocumentTitle(p ? fullName(p) : 'Artisan')

  if (query.isPending) return <Loading />
  if (query.error?.status === 404 || query.error?.status === 400) {
    return (
      <Panel>
        <div className="flex flex-col items-start gap-4">
          <h1 className="text-h1">This artisan isn’t listed right now</h1>
          <p className="max-w-[60ch] text-fg-2">They may have paused their profile or left Fixly.</p>
          <LinkButton to="/artisans">Back to the directory</LinkButton>
        </div>
      </Panel>
    )
  }
  if (query.isError) {
    return <Panel><ErrorState headingLevel={1} title="Couldn’t load this artisan" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isFetching} /></Panel>
  }
  return <Profile p={p} id={profileId} />
}
