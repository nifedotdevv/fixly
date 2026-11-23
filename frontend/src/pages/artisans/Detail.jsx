import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Avatar, Badge, Button, ErrorState, LinkButton, Skeleton } from '../../components/ui/index.js'
import { api } from '../../lib/api.js'
import { queryKeys } from '../../lib/queryClient.js'
import { useAuth } from '../../auth/useAuth.js'
import { useDocumentTitle } from '../../layouts/useDocumentTitle.js'
import { Profession, Rating } from './shared.jsx'
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
    <div aria-hidden="true" className="flex items-start gap-4 py-6">
      <Skeleton className="size-16 rounded-full" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-72" />
      </div>
    </div>
  )
}

function Profile({ p, id }) {
  const name = fullName(p)
  const price = fromPrice(p)
  const years = p.experience_years
  const areas = [...new Set([p.city, ...(p.serviceAreas ?? [])].filter(Boolean).map(titleCase))]
  return (
    <article className="flex max-w-2xl flex-col gap-6 py-6">
      <header className="flex items-start gap-4">
        <Avatar src={p.user_id?.avatar?.url} role="artisan" name={name} size={64} decorative />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="break-words">{name}</h1>
          <span className="text-fg-2"><Profession name={p.profession} /></span>
          {p.professional_headline && <p className="text-fg-2">{p.professional_headline}</p>}
        </div>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3">
        <dt className="text-muted">Rating</dt>
        <dd><Rating summary={p.ratingSummary} /></dd>
        {years != null && (
          <>
            <dt className="text-muted">Experience</dt>
            <dd className="tabular">{years} {years === 1 ? 'year’s' : 'years’'} experience</dd>
          </>
        )}
        {price && (
          <>
            <dt className="text-muted">Price</dt>
            <dd className="tabular font-medium">{price}</dd>
          </>
        )}
        {areas.length > 0 && (
          <>
            <dt className="text-muted">Works in</dt>
            <dd>{areas.join(', ')}</dd>
          </>
        )}
        <dt className="text-muted">Availability</dt>
        <dd>{p.isAvailable === false ? <Badge>Away</Badge> : 'Available'}</dd>
      </dl>

      {p.skills?.length > 0 && (
        <section aria-labelledby="skills-h" className="flex flex-col gap-2">
          <h2 id="skills-h" className="text-h3">Skills</h2>
          <ul className="flex flex-wrap gap-2">
            {p.skills.map((s) => <li key={s}><Badge>{s}</Badge></li>)}
          </ul>
        </section>
      )}

      <RequestAction profile={p} id={id} />
    </article>
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
      <div className="flex flex-col items-start gap-4 py-8">
        <h1>This artisan isn’t listed right now</h1>
        <p className="max-w-[60ch] text-fg-2">They may have paused their profile or left Fixly.</p>
        <LinkButton to="/artisans">Back to the directory</LinkButton>
      </div>
    )
  }
  if (query.isError) {
    return <ErrorState headingLevel={1} title="Couldn’t load this artisan" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isFetching} />
  }
  return <Profile p={p} id={profileId} />
}
