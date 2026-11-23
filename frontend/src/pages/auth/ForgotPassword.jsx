import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../lib/api.js'
import { Button, Field, Input } from '../../components/ui/index.js'
import AuthFrame from './AuthFrame.jsx'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email }, auth: false })
      setSent(true)
    } catch (err) {
      // 400 means a malformed address. Anything else that reaches the user is shown as-is
      // (429/503); a real account is never confirmed or denied.
      if (err.status === 400) setError('Enter a valid email address.')
      else if (err.status === 429 || err.status === 503) setError(err.message)
      else setSent(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame title="Reset your password" intro="Enter your email and we'll send you a link to choose a new password.">
      {sent ? (
        <>
          <p role="status" className="text-fg-2">If that address has an account, a link is on its way. Check your inbox.</p>
          <Link to="/login" className="link">Back to sign in</Link>
        </>
      ) : (
        <form onSubmit={submit} noValidate className="flex w-full flex-col gap-4">
          <Field label="Email" error={error}>
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy} loadingLabel="Sending…">Send reset link</Button>
        </form>
      )}
    </AuthFrame>
  )
}
