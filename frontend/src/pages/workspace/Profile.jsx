import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { Button, ErrorState, Field, Input, ChipsInput, LinkButton, PageHeader, Panel, Select, Skeleton, useToast } from '../../components/ui/index.js'
import { useAuth } from '../../auth/useAuth.js'
import { api, ApiError } from '../../lib/api.js'
import { queryKeys } from '../../lib/queryClient.js'
import { useFocusFirstInvalid } from '../account/helpers.js'
import Switch from './Switch.jsx'
import { PROFESSIONS, changedFields, createBody, serverErrors, toForm, validate } from './profileForm.js'

function Notice({ role = 'status', children }) {
  return <div role={role} className={`rounded-sm p-3 text-fg ${role === 'alert' ? 'bg-error-soft' : 'bg-warning-soft'}`}>{children}</div>
}

function Availability({ profile, create, value, onCreateChange }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const mutation = useMutation({
    mutationFn: (isAvailable) => api(`/artisan/profile/${profile._id ?? profile.id}`, { method: 'PATCH', body: { isAvailable } }),
    onMutate: async (isAvailable) => {
      await qc.cancelQueries({ queryKey: queryKeys.myProfile() })
      const previous = qc.getQueryData(queryKeys.myProfile())
      qc.setQueryData(queryKeys.myProfile(), (old) => (old ? { ...old, data: { ...old.data, isAvailable } } : old))
      return { previous }
    },
    onError: (err, _v, ctx) => {
      qc.setQueryData(queryKeys.myProfile(), ctx?.previous)
      toast({ title: err instanceof ApiError ? err.message : "Couldn't update availability", tone: 'error' })
    },
    onSuccess: (_d, isAvailable) => {
      qc.invalidateQueries({ queryKey: ['artisans'] })
      qc.invalidateQueries({ queryKey: ['artisan'] })
      toast({ title: isAvailable ? 'You are taking new requests' : 'You are not taking new requests', tone: 'success' })
    },
  })
  const checked = create ? value : Boolean(profile.isAvailable)
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <span id="availability-label" className="font-medium text-fg">Taking new requests</span>
        <span className="text-caption text-muted">Turn this off to stop new requests without hiding your profile.</span>
      </div>
      <Switch
        aria-labelledby="availability-label"
        checked={checked}
        onCheckedChange={(next) => (create ? onCreateChange(next) : mutation.mutate(next))}
      />
    </div>
  )
}

function ProfileForm({ profile }) {
  const create = !profile
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { toast } = useToast()
  const formRef = useRef(null)
  const [base, setBase] = useState(() => toForm(profile ?? {}))
  const [form, setForm] = useState(base)
  const [available, setAvailable] = useState(true)
  const [errs, setErrs] = useState({})
  const [failure, setFailure] = useState('')
  const [attempt, setAttempt] = useState(0)
  useFocusFirstInvalid(formRef, attempt)

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }))
  const setList = (name) => (list) => setForm((f) => ({ ...f, [name]: list }))
  const diff = create ? null : changedFields(form, base)
  const dirty = create || Object.keys(diff).length > 0

  const save = useMutation({
    mutationFn: () =>
      create
        ? api('/artisan/profile', { method: 'POST', body: createBody(form, available) })
        : api(`/artisan/profile/${profile._id ?? profile.id}`, { method: 'PATCH', body: diff }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.myProfile() })
      qc.invalidateQueries({ queryKey: ['artisan'] })
      qc.invalidateQueries({ queryKey: ['artisans'] })
      toast({ title: create ? 'Profile created' : 'Changes saved', tone: 'success' })
      if (create) navigate('/requests')
      else setBase(form)
    },
    onError: (err) => {
      if (!(err instanceof ApiError)) throw err
      const { fields, rest } = serverErrors(err.status === 400 ? err.errors : [])
      setErrs(fields)
      setFailure(err.status !== 400 ? err.message : rest.join(' ') || (Object.keys(fields).length ? '' : err.message))
      setAttempt((n) => n + 1)
    },
  })

  function onSubmit(e) {
    e.preventDefault()
    setFailure('')
    const local = validate(form)
    setErrs(local)
    if (Object.keys(local).length) return setAttempt((n) => n + 1)
    save.mutate()
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {failure && <Notice role="alert">{failure}</Notice>}
      <Panel title="What you do" description="The first thing homeowners read about you.">
        <div className="flex max-w-md flex-col gap-4">
        <Field label="Headline" error={errs.professional_headline}>
          <Input value={form.professional_headline} onChange={set('professional_headline')} />
        </Field>
        <Field label="Profession" error={errs.profession}>
          <Select value={form.profession} onChange={set('profession')}>
            <option value="">Choose a profession</option>
            {PROFESSIONS.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Years of experience" error={errs.experience_years}>
          <Input inputMode="numeric" autoComplete="off" value={form.experience_years} onChange={set('experience_years')} className="tabular" />
        </Field>
        <Field label="Starting price" helper="Whole naira. Shown as the lowest price you charge." error={errs.starting_price}>
          <Input inputMode="numeric" autoComplete="off" value={form.starting_price} onChange={set('starting_price')} className="tabular" />
        </Field>
        </div>
      </Panel>
      <Panel title="Where you work" description="Homeowners can filter by area and skill.">
        <div className="flex max-w-md flex-col gap-4">
        <Field label="City" error={errs.city}>
          <Input value={form.city} onChange={set('city')} autoComplete="address-level2" />
        </Field>
        <Field label="Service areas" helper="Press Enter or comma after each. Up to 20." error={errs.serviceAreas}>
          <ChipsInput value={form.serviceAreas} onChange={setList('serviceAreas')} max={20} maxLength={60} />
        </Field>
        <Field label="Skills" helper="Press Enter or comma after each. Up to 10, 2 to 40 characters." error={errs.skills}>
          <ChipsInput value={form.skills} onChange={setList('skills')} max={10} maxLength={40} />
        </Field>
        </div>
      </Panel>
      <Panel title="Contact (private)" description="Never shown publicly. Used for bookings.">
        <div className="flex max-w-md flex-col gap-4">
        <Field label="Phone number" error={errs.phone_number}>
          <Input type="tel" autoComplete="tel" value={form.phone_number} onChange={set('phone_number')} />
        </Field>
        <Field label="Home address" error={errs.residential_address}>
          <Input autoComplete="street-address" value={form.residential_address} onChange={set('residential_address')} />
        </Field>
        <Field label="Work address" error={errs.office_address}>
          <Input value={form.office_address} onChange={set('office_address')} />
        </Field>
        </div>
      </Panel>
      <Panel title="Availability" description="Choose whether homeowners can send you new requests.">
        <Availability profile={profile} create={create} value={available} onCreateChange={setAvailable} />
      </Panel>
      <Button type="submit" loading={save.isPending} loadingLabel="Saving…" disabled={!dirty} className="sm:self-end">
        {create ? 'Create profile' : 'Save changes'}
      </Button>
    </form>
  )
}

export default function WorkspaceProfile() {
  const { me } = useAuth()
  const query = useQuery({ queryKey: queryKeys.myProfile(), queryFn: () => api('/artisan/profile/me') })
  const missing = query.error instanceof ApiError && query.error.status === 404
  const profile = query.data?.data
  const summary = profile?.ratingSummary

  let body
  if (query.isPending) body = <Skeleton className="h-64 w-full" />
  else if (query.isError && !missing) {
    body = <ErrorState title="Couldn't load your profile" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isFetching} />
  } else body = <ProfileForm key={missing ? 'new' : 'edit'} profile={missing ? null : profile} />

  const editing = !query.isPending && !query.isError && profile
  let summaryText
  if (missing) summaryText = 'Homeowners see this in the directory.'
  else if (editing && summary) {
    summaryText = (
      <>
        {summary.count > 0 ? <><span className="tabular">{Number(summary.average).toFixed(1)}</span> from <span className="tabular">{summary.count}</span> {summary.count === 1 ? 'review' : 'reviews'}. </> : 'No ratings yet. '}
        Ratings come from completed jobs.
      </>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0!"
        title={query.isPending ? <Skeleton className="h-9 w-64" /> : missing ? 'Set up your artisan profile' : 'Your artisan profile'}
        summary={summaryText}
        actions={editing ? <LinkButton variant="secondary" to={`/artisans/${profile._id ?? profile.id}`}>View public profile</LinkButton> : undefined}
      />
      {me?.emailVerified === false && <Notice>Your profile is hidden from the directory until you verify your email.</Notice>}
      {body}
    </div>
  )
}
