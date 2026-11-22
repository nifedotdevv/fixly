import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, ConfirmDialog, Input } from '../../components/ui/index.js'
import { api, ApiError } from '../../lib/api.js'
import { clearSession } from '../../lib/session.js'
import { queryClient } from '../../lib/queryClient.js'
import { Section } from './shared.jsx'
import { LINK } from './helpers.js'

function endSession(navigate, notice) {
  queryClient.clear()
  clearSession()
  navigate('/login', { replace: true, state: { notice } })
}

export function SessionsSection() {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  async function confirm() {
    setError('')
    try {
      await api('/auth/logout-all', { method: 'POST' })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setError(err.message)
      throw err
    }
    endSession(navigate, 'Signed out on all devices.')
  }

  return (
    <Section title="Sessions" description="Ends every active sign-in, including this one.">
      <ConfirmDialog
        trigger={<Button variant="secondary" className="self-start">Sign out on all devices</Button>}
        title="Sign out on all devices?"
        description="You will need to sign in again everywhere, including here."
        confirmLabel="Sign out on all devices"
        loadingLabel="Signing out"
        tone="primary"
        error={error}
        onOpenChange={(o) => o && setError('')}
        onConfirm={confirm}
      />
    </Section>
  )
}

export function DeleteSection() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [invalid, setInvalid] = useState(false)

  async function confirm() {
    setError(null)
    setInvalid(false)
    try {
      await api('/users/me', { method: 'DELETE', body: { password } })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      if (err.status === 401) {
        setInvalid(true)
        setError('Password is incorrect')
      } else if (err.status === 409 && err.code === 'LAST_ADMIN') {
        setError('Fixly needs at least one active admin.')
      } else if (err.status === 409 && /unresolved service requests/i.test(err.message)) {
        setError(
          <>Finish or cancel your open jobs first. <Link to="/requests" className={LINK}>See your requests</Link></>,
        )
      } else setError(err.message)
      throw err
    }
    endSession(navigate, 'Account deleted. You can reactivate it within 30 days from the sign-in page.')
  }

  const fields = (
    <div className="mt-4 flex flex-col gap-2">
      <label htmlFor="delete-password" className="font-medium text-fg">Password</label>
      <Input
        id="delete-password"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-invalid={invalid ? true : undefined}
      />
    </div>
  )

  return (
    <Section danger title="Delete account" description="Deleting hides your account. You can reactivate it within 30 days.">
      <ConfirmDialog
        trigger={<Button variant="destructive" className="self-start">Delete account</Button>}
        title="Delete your account?"
        description="You can reactivate it within 30 days from the sign-in page. Enter your password to delete it."
        confirmLabel="Delete my account"
        loadingLabel="Deleting"
        error={error}
        onOpenChange={(o) => { if (o) { setError(null); setInvalid(false); setPassword('') } }}
        onConfirm={confirm}
      >
        {fields}
      </ConfirmDialog>
    </Section>
  )
}
