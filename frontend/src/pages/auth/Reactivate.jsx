import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Field, Input } from '../../components/ui/index.js'
import { api, ApiError } from '../../lib/api.js'
import AuthFrame from './AuthFrame.jsx'

const LINK = 'link'

export default function Reactivate() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [restored, setRestored] = useState(false)
  const [failure, setFailure] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setFailure('')
    try {
      await api('/auth/reactivate', { method: 'POST', body: { email, password }, auth: false })
      setRestored(true)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      setFailure(
        err.status === 401
          ? "We can't reactivate this account. It may be past 30 days or closed by Fixly."
          : err.message,
      )
      setLoading(false)
    }
  }

  return (
    <AuthFrame
      title="Reactivate your account"
      intro={restored ? undefined : 'Deleted accounts can be restored within 30 days. Use the email and password you had.'}
    >
      {restored ? (
        <p role="status" className="rounded-sm bg-success-soft p-3 text-fg">
          Account restored. <Link to="/login" className={LINK}>Sign in.</Link>
        </p>
      ) : (
        <>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            {failure && <p role="alert" className="rounded-sm bg-error-soft p-3 text-fg">{failure}</p>}
            <Field label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" loading={loading} loadingLabel="Reactivating…" className="self-start">Reactivate account</Button>
          </form>
        </>
      )}
    </AuthFrame>
  )
}
