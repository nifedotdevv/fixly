import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar, Button, ConfirmDialog, EmptyState, ErrorState, Field, Input, LinkButton, Select, Skeleton, useToast } from '../../../components/ui/index.js'
import { ApiError, api } from '../../../lib/api.js'
import { queryKeys } from '../../../lib/queryClient.js'
import { useAuth } from '../../../auth/useAuth.js'
import { useDocumentTitle } from '../../../layouts/useDocumentTitle.js'
import { ROLE_LABELS, formatDate, fullName, isVerified, mutationMessage, roleLabel, statusLabel } from './helpers.js'

const BACK = <LinkButton to="/admin/users" variant="secondary">Back to users</LinkButton>

function Fact({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption text-fg-2">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  )
}

function EditName({ user, onSave }) {
  const [first, setFirst] = useState(user.firstName ?? '')
  const [last, setLast] = useState(user.lastName ?? '')
  const [error, setError] = useState('')
  const save = useMutation({
    mutationFn: () => onSave({ firstName: first.trim(), lastName: last.trim() }),
    onSuccess: () => setError(''),
    onError: (e) => setError(mutationMessage(e)),
  })
  const unchanged = first.trim() === (user.firstName ?? '') && last.trim() === (user.lastName ?? '')
  return (
    <section aria-labelledby="name-h" className="flex flex-col gap-4">
      <h2 id="name-h">Name</h2>
      <form
        onSubmit={(e) => { e.preventDefault(); save.mutate() }}
        className="flex max-w-md flex-col gap-4"
      >
        <Field label="First name"><Input value={first} onChange={(e) => setFirst(e.target.value)} autoComplete="off" /></Field>
        <Field label="Last name"><Input value={last} onChange={(e) => setLast(e.target.value)} autoComplete="off" /></Field>
        {error && <p role="alert" className="text-caption text-error">{error}</p>}
        <div>
          <Button type="submit" loading={save.isPending} loadingLabel="Saving…" disabled={unchanged || !first.trim() || !last.trim()}>
            Save name
          </Button>
        </div>
      </form>
    </section>
  )
}

function ChangeRole({ user, name, onSave }) {
  const [role, setRole] = useState(user.role)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const change = useMutation({
    mutationFn: () => onSave({ role }),
    onError: (e) => setError(mutationMessage(e, { role: true })),
  })
  const dirty = role !== user.role
  return (
    <section aria-labelledby="role-h" className="flex flex-col gap-4">
      <h2 id="role-h">Role</h2>
      <div className="flex max-w-md flex-col gap-4">
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <div>
          <Button variant="secondary" disabled={!dirty} onClick={() => { setError(''); setOpen(true) }}>Change role</Button>
        </div>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) { setError(''); setRole(user.role) } }}
        title={`Change ${name}'s role to ${roleLabel(role)}?`}
        description="Their access changes the next time they open Fixly."
        confirmLabel="Change role"
        loadingLabel="Changing…"
        tone="primary"
        error={error}
        onConfirm={() => change.mutateAsync()}
      />
    </section>
  )
}

function Lifecycle({ user, name, isSelf, run }) {
  const [error, setError] = useState('')
  const reset = (o) => { if (!o) setError('') }
  const guard = (fn) => async () => {
    setError('')
    try { await fn() } catch (e) { setError(mutationMessage(e)); throw e }
  }
  return (
    <section aria-labelledby="life-h" className="flex flex-col gap-4">
      <h2 id="life-h">Account</h2>
      {isSelf && <p className="text-fg-2">This is your account.</p>}
      <div className="flex flex-wrap gap-3">
        {user.isDeleted ? (
          <ConfirmDialog
            tone="primary"
            title={`Restore ${name}?`}
            description="They can sign in again and appear in the directory."
            confirmLabel="Restore"
            loadingLabel="Restoring…"
            error={error}
            onOpenChange={reset}
            onConfirm={guard(() => run('restore'))}
            trigger={<Button variant="secondary">Restore</Button>}
          />
        ) : (
          <ConfirmDialog
            title={`Deactivate ${name}?`}
            description="They're signed out everywhere and hidden from the directory. You can restore them later."
            confirmLabel="Deactivate"
            loadingLabel="Deactivating…"
            error={error}
            onOpenChange={reset}
            onConfirm={guard(() => run('soft-delete'))}
            trigger={<Button variant="secondary">Deactivate</Button>}
          />
        )}
        <ConfirmDialog
          title={`Delete ${name} permanently?`}
          description="This can't be undone. Their profile and photo are removed. Booking history stays."
          confirmLabel="Delete permanently"
          loadingLabel="Deleting…"
          typeToConfirm={user.email}
          error={error}
          onOpenChange={reset}
          onConfirm={guard(() => run('delete'))}
          trigger={<Button variant="destructive">Delete permanently</Button>}
        />
      </div>
    </section>
  )
}

export default function UserDetail() {
  const { id } = useParams()
  const { me } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const client = useQueryClient()
  const q = useQuery({
    queryKey: queryKeys.adminUser(id),
    queryFn: ({ signal }) => api(`/admin/user/${id}`, { query: { includeDeleted: 'true' }, signal }),
  })
  const user = q.data?.data
  const name = user ? fullName(user) : 'User'
  useDocumentTitle(name)

  const invalidate = () => Promise.all([
    client.invalidateQueries({ queryKey: ['admin', 'users'] }),
    client.invalidateQueries({ queryKey: queryKeys.adminUser(id) }),
  ])

  const patch = async (body) => {
    await api(`/admin/user/${id}`, { method: 'PATCH', body })
    await invalidate()
    toast({ title: 'User updated', tone: 'success' })
  }

  async function run(action) {
    if (action === 'delete') {
      await api(`/admin/user/${id}`, { method: 'DELETE' })
      await invalidate()
      toast({ title: `${name} deleted`, tone: 'success' })
      navigate('/admin/users')
      return
    }
    await api(`/admin/user/${id}/${action}`, { method: 'PATCH' })
    await invalidate()
    toast({ title: action === 'restore' ? `${name} restored` : `${name} deactivated`, tone: 'success' })
  }

  if (q.isPending) {
    return (
      <div aria-hidden="true" className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex flex-col gap-2"><Skeleton className="h-7 w-48" /><Skeleton className="h-5 w-64" /></div>
        </div>
        <Skeleton className="h-24 w-full max-w-xl" />
      </div>
    )
  }
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) {
      return <EmptyState message="User not found." action={BACK} />
    }
    return <ErrorState title="Couldn't load this user" message={q.error.message} onRetry={() => q.refetch()} retrying={q.isFetching} headingLevel={1} />
  }

  const isSelf = me?.id != null && String(me.id) === String(user.id)
  const profile = user.artisanProfile
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Avatar src={user.avatar?.url} role={user.role} name={name} size={64} decorative />
          <div className="min-w-0">
            <h1 className="break-words">{name}</h1>
            <p className="text-fg-2 break-all">{user.email} <span className="text-muted">{roleLabel(user.role)}</span></p>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-xl">
          <Fact label="Status">{statusLabel(user)}</Fact>
          <Fact label="Email verified">{isVerified(user) ? 'Yes' : 'No'}</Fact>
          <Fact label="Created"><span className="tabular">{formatDate(user.createdAt)}</span></Fact>
          {user.isDeleted && user.deletedAt && <Fact label="Deactivated on"><span className="tabular">{formatDate(user.deletedAt)}</span></Fact>}
          {user.isDeleted && user.deletionReason && <Fact label="Reason">{user.deletionReason === 'self' ? 'They deactivated it' : 'An admin deactivated it'}</Fact>}
          <Fact label="Artisan profile">{profile ? 'Yes' : 'No'}</Fact>
        </dl>
      </div>
      <EditName key={`${user.firstName}|${user.lastName}`} user={user} onSave={patch} />
      <ChangeRole key={user.role} user={user} name={name} onSave={patch} />
      <Lifecycle user={user} name={name} isSelf={isSelf} run={run} />
      <div>{BACK}</div>
    </div>
  )
}
