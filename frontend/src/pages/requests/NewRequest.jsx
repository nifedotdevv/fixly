import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar, Button, ErrorState, Field, Input, Skeleton, Textarea, DateTimeInput, useToast } from '../../components/ui/index.js'
import { api } from '../../lib/api.js'
import { queryKeys } from '../../lib/queryClient.js'
import { toLocalInput, toOffsetISO, zoneLabel } from '../../lib/time.js'
import { useAuth } from '../../auth/useAuth.js'
import { VerifyNotice } from '../../layouts/VerifyBanner.jsx'
import { useDocumentTitle } from '../../layouts/useDocumentTitle.js'
import { Profession } from '../artisans/shared.jsx'
import { fromPrice, fullName } from '../artisans/helpers.js'

const MIN_MS = 15 * 60000
const MAX_MS = 7 * 24 * 3600000
const HOUR = 3600000
const DESCRIPTION_MAX = 4000

const FIELD_NAMES = ['description', 'serviceAddress', 'inspectionWindow', 'responseDeadline']
const fieldFor = (message) => {
  const text = String(message)
  if (/inspectionWindow|window/i.test(text)) return 'inspectionWindow'
  return FIELD_NAMES.find((name) => text.includes(name)) ?? null
}

// Earlier of start minus 1 hour and 24 hours from now, but never sooner than the 15 minute minimum.
function defaultDeadline(startIso, now = Date.now()) {
  const start = new Date(startIso).getTime()
  if (Number.isNaN(start)) return null
  const target = Math.max(Math.min(start - HOUR, now + 24 * HOUR), now + MIN_MS + 60000)
  return toOffsetISO(new Date(target))
}

function validate(values, now = Date.now()) {
  const errors = {}
  const description = values.description.trim()
  const address = values.serviceAddress.trim()
  if (description.length < 3) errors.description = 'Describe the problem in at least 3 characters.'
  else if (description.length > DESCRIPTION_MAX) errors.description = `Keep this to ${DESCRIPTION_MAX} characters or fewer.`
  if (address.length < 3) errors.serviceAddress = 'Enter the address in at least 3 characters.'
  else if (address.length > 1000) errors.serviceAddress = 'Keep the address to 1000 characters or fewer.'

  const start = values.start ? new Date(values.start).getTime() : null
  const end = values.end ? new Date(values.end).getTime() : null
  if (start == null) errors.start = 'Choose when the inspection can start.'
  else if (start <= now) errors.start = 'Start time must be in the future.'
  if (end == null) errors.end = 'Choose when the inspection window ends.'
  else if (start != null && end <= start) errors.end = 'End time must be after the start time.'

  const deadline = values.responseDeadline ? new Date(values.responseDeadline).getTime() : null
  if (deadline == null) errors.responseDeadline = 'Choose when you need a reply by.'
  else if (deadline - now < MIN_MS) errors.responseDeadline = 'Reply time must be at least 15 minutes from now.'
  else if (deadline - now > MAX_MS) errors.responseDeadline = 'Reply time must be within 7 days from now.'
  else if (start != null && deadline > start) errors.responseDeadline = 'Reply time must be no later than the inspection start.'
  return errors
}

function Summary({ profile }) {
  const name = fullName(profile)
  const price = fromPrice(profile)
  return (
    <header className="flex items-center gap-4">
      <Avatar src={profile.user_id?.avatar?.url} role="artisan" name={name} size={48} decorative />
      <div className="flex min-w-0 flex-col">
        <p className="break-words font-medium">{name}</p>
        <p className="text-fg-2"><Profession name={profile.profession} /></p>
        {price && <p className="tabular text-caption text-muted">{price}</p>}
      </div>
    </header>
  )
}

function Loading() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-4 py-6">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

export default function NewRequest() {
  useDocumentTitle('Request an inspection')
  const { profileId } = useParams()
  const { me } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [values, setValues] = useState({ description: '', serviceAddress: '', start: null, end: null, responseDeadline: null })
  const [deadlineTouched, setDeadlineTouched] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [unverified, setUnverified] = useState(false)

  const query = useQuery({
    queryKey: queryKeys.artisan(profileId),
    queryFn: ({ signal }) => api(`/artisan/profile/${profileId}`, { signal }).then((r) => r.data),
  })

  const send = useMutation({
    mutationFn: (body) => api('/service-requests', { method: 'POST', body }).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      toast({ title: 'Request sent', tone: 'success' })
      navigate(`/requests/${data.id}`)
    },
    onError: (err) => {
      if (err.status === 403 && err.code === 'EMAIL_NOT_VERIFIED') {
        setUnverified(true)
        return
      }
      if (err.status === 409 && err.code === 'ARTISAN_UNAVAILABLE') {
        setFormError("This artisan isn't taking requests right now.")
        return
      }
      setFormError(err.message)
      const next = {}
      for (const message of err.errors ?? []) {
        const key = fieldFor(message)
        if (key) next[key === 'inspectionWindow' ? 'start' : key] = String(message)
      }
      setErrors(next)
    },
  })

  const set = (key) => (value) => setValues((v) => ({ ...v, [key]: value }))
  const setStart = (iso) =>
    setValues((v) => ({
      ...v,
      start: iso,
      responseDeadline: !deadlineTouched && iso ? defaultDeadline(iso) : v.responseDeadline,
    }))

  const submit = (e) => {
    e.preventDefault()
    setFormError('')
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    send.mutate({
      artisan: profile.user_id._id ?? profile.user_id.id,
      description: values.description.trim(),
      serviceAddress: values.serviceAddress.trim(),
      inspectionWindow: { start: values.start, end: values.end },
      responseDeadline: values.responseDeadline,
    })
  }

  if (query.isPending) return <Loading />
  if (query.error?.status === 404) {
    return (
      <div className="flex max-w-[40rem] flex-col gap-2 py-8">
        <h1>This artisan isn't listed right now</h1>
      </div>
    )
  }
  if (query.error) {
    return <ErrorState title="Couldn't load this artisan" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isFetching} headingLevel={1} />
  }
  const profile = query.data
  const away = profile.isAvailable === false

  return (
    <div className="flex max-w-[40rem] flex-col gap-6 py-6">
      <Summary profile={profile} />
      <h1>Request an inspection</h1>
      {away ? (
        <p role="status" className="text-fg-2">Not taking requests right now</p>
      ) : (
        <>
          {(unverified || me?.emailVerified === false) && <VerifyNotice email={me?.email} />}
          <form onSubmit={submit} noValidate className="flex flex-col gap-6">
            {formError && <p role="alert" className="text-error">{formError}</p>}
            <Field label="What needs fixing?" error={errors.description}
              helper={<span className="tabular">{values.description.length} / {DESCRIPTION_MAX}</span>}>
              <Textarea value={values.description} onChange={(e) => set('description')(e.target.value)} />
            </Field>
            <Field label="Service address" helper="Shared only with this artisan" error={errors.serviceAddress}>
              <Input value={values.serviceAddress} onChange={(e) => set('serviceAddress')(e.target.value)} />
            </Field>
            <fieldset className="flex flex-col gap-4 [&_input+p]:hidden">
              <legend className="mb-1 font-medium">Inspection window</legend>
              <p className="-mt-3 text-caption text-muted">Times are in {zoneLabel()}</p>
              <Field label="Starts" error={errors.start}>
                <DateTimeInput value={values.start ? toLocalInput(values.start) : ''} onChange={setStart} />
              </Field>
              <Field label="Ends" error={errors.end}>
                <DateTimeInput value={values.end ? toLocalInput(values.end) : ''} onChange={set('end')} />
              </Field>
              <Field label="Reply needed by" error={errors.responseDeadline} helper="Between 15 minutes and 7 days from now, and no later than the start.">
                <DateTimeInput
                  value={values.responseDeadline ? toLocalInput(values.responseDeadline) : ''}
                  onChange={(iso) => { setDeadlineTouched(true); set('responseDeadline')(iso) }}
                />
              </Field>
            </fieldset>
            <div>
              <Button type="submit" loading={send.isPending} loadingLabel="Sending…">Send request</Button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
