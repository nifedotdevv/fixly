import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Check, Circle } from 'lucide-react'
import { api } from '../../lib/api.js'
import { clearSession } from '../../lib/session.js'
import { Button, Field, Input } from '../../components/ui/index.js'
import useFragmentToken from './useFragmentToken.js'

export const RESET_NOTICE = 'Password changed. Sign in with the new one.'

const utf8Bytes = (s) => new TextEncoder().encode(s).length
const RULES = [
  ['At least 10 characters', (p) => p.length >= 10],
  ['An uppercase letter', (p) => /[A-Z]/.test(p)],
  ['A lowercase letter', (p) => /[a-z]/.test(p)],
  ['A digit', (p) => /[0-9]/.test(p)],
  ['At most 72 bytes', (p) => utf8Bytes(p) <= 72],
]

export default function ResetPassword() {
  const token = useFragmentToken()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const allMet = RULES.every(([, test]) => test(password))
  const mismatch = confirm !== '' && confirm !== password

  const submit = async (e) => {
    e.preventDefault()
    if (!allMet || password !== confirm) return
    setBusy(true)
    setError(null)
    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: { token, password, confirmPassword: confirm },
        auth: false,
      })
      clearSession()
      navigate('/login', { replace: true, state: { notice: RESET_NOTICE } })
    } catch (err) {
      setError({ status: err.status, message: err.message })
      setBusy(false)
    }
  }

  const linkProblem = token === null || error?.status === 400
  if (token === undefined) return <div className="py-8"><h1>Set a new password</h1></div>

  return (
    <div className="flex max-w-[60ch] flex-col items-start gap-4 py-8">
      <h1>Set a new password</h1>
      {linkProblem ? (
        <>
          <p role="alert" className="text-error">
            {token === null ? 'This link is invalid or has expired.' : error.message}
          </p>
          <Link to="/forgot-password" className="text-accent underline underline-offset-2">Request a new link</Link>
        </>
      ) : (
        <form onSubmit={submit} noValidate className="flex w-full max-w-sm flex-col gap-4">
          <Field label="New password">
            <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <ul aria-label="Password rules" className="flex flex-col gap-1 text-caption">
            {RULES.map(([label, test]) => {
              const met = test(password)
              const Icon = met ? Check : Circle
              return (
                <li key={label} className={`flex items-center gap-2 ${met ? 'text-success' : 'text-muted'}`}>
                  <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                  {label}
                  <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
                </li>
              )
            })}
          </ul>
          <Field label="Confirm new password" error={mismatch ? 'Passwords do not match.' : undefined}>
            <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <p role="alert" className="text-error">{error.message}</p>}
          <Button type="submit" loading={busy} loadingLabel="Saving…" disabled={!allMet || password !== confirm}>Change password</Button>
        </form>
      )}
    </div>
  )
}
