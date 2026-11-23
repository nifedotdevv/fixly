import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../../lib/api.js'
import { clearSession } from '../../lib/session.js'
import { Button, Field, Input } from '../../components/ui/index.js'
import useFragmentToken from './useFragmentToken.js'
import AuthFrame from './AuthFrame.jsx'
import PasswordRuleList from '../account/PasswordRuleList.jsx'
import { passwordValid } from '../account/passwordRules.js'

export const RESET_NOTICE = 'Password changed. Sign in with the new one.'


export default function ResetPassword() {
  const token = useFragmentToken()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const allMet = passwordValid(password)
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
  if (token === undefined) return <AuthFrame title="Set a new password" />

  return (
    <AuthFrame title="Set a new password" intro="Choose a password you have not used on Fixly before.">
      {linkProblem ? (
        <>
          <p role="alert" className="text-error">
            {token === null ? 'This link is invalid or has expired.' : error.message}
          </p>
          <Link to="/forgot-password" className="link">Request a new link</Link>
        </>
      ) : (
        <form onSubmit={submit} noValidate className="flex w-full flex-col gap-4">
          <Field label="New password">
            <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <PasswordRuleList password={password} />
          <Field label="Confirm new password" error={mismatch ? 'Passwords do not match.' : undefined}>
            <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {error && <p role="alert" className="text-error">{error.message}</p>}
          <Button type="submit" loading={busy} loadingLabel="Saving…" disabled={!allMet || password !== confirm}>Change password</Button>
        </form>
      )}
    </AuthFrame>
  )
}
