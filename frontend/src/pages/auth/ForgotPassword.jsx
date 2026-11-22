import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '../../lib/api.js'
import { Button, Field, Input } from '../../components/ui/index.js'

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
    <div className="flex max-w-[60ch] flex-col items-start gap-4 py-8">
      <h1>Reset your password</h1>
      {sent ? (
        <>
          <p role="status" className="text-fg-2">If that address has an account, a link is on its way. Check your inbox.</p>
          <Link to="/login" className="text-accent underline underline-offset-2">Back to sign in</Link>
        </>
      ) : (
        <form onSubmit={submit} noValidate className="flex w-full max-w-sm flex-col gap-4">
          <Field label="Email" error={error}>
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy} loadingLabel="Sending…">Send reset link</Button>
        </form>
      )}
    </div>
  )
}
