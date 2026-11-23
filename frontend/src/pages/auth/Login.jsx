import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { Button, Field, Input } from '../../components/ui/index.js'
import { api, ApiError } from '../../lib/api.js'
import { safeNext } from '../../auth/roles.js'
import { useAuth } from '../../auth/useAuth.js'
import AuthFrame from './AuthFrame.jsx'

const LINK = 'link'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const location = useLocation()
  const notice = location.state?.notice ?? (params.get('expired') === '1' ? 'Your session ended. Sign in again.' : null)
  const next = safeNext(params.get('next'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [errors, setErrors] = useState([])
  const [failure, setFailure] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setRejected(false)
    setErrors([])
    setFailure('')
    try {
      const { data } = await api('/auth/login', { method: 'POST', body: { email, password }, auth: false })
      signIn(data.token, data)
      navigate(next ?? '/dashboard', { replace: true })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      if (err.status === 401) setRejected(true)
      else if (err.status === 400 && err.errors.length) setErrors(err.errors)
      else setFailure(err.message)
      setLoading(false)
    }
  }

  const fieldError = (name) => errors.find((x) => x.field === name)?.message
  const registerTo = next ? `/register?next=${encodeURIComponent(next)}` : '/register'

  return (
    <AuthFrame title="Sign in" intro="Pick up your requests where you left them.">
      {notice && <p role="status" className="rounded-sm bg-info-soft p-3 text-fg">{notice}</p>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {rejected && (
          <div role="alert" className="flex flex-col gap-1 rounded-sm bg-error-soft p-3 text-fg">
            <p className="font-medium">Email or password is incorrect</p>
            <p>
              <Link to="/forgot-password" className={LINK}>Forgot your password?</Link>{' '}
              <Link to="/reactivate" className={LINK}>Deleted your account?</Link>
            </p>
          </div>
        )}
        {failure && <p role="alert" className="rounded-sm bg-error-soft p-3 text-fg">{failure}</p>}
        <Field label="Email" error={fieldError('email')}>
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-2">
          <Field label="Password" error={fieldError('password')}>
            <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {!rejected && <Link to="/forgot-password" className={`${LINK} self-start text-small`}>Forgot password?</Link>}
        </div>
        <Button type="submit" loading={loading} loadingLabel="Signing in…" className="self-start">Sign in</Button>
      </form>
      <p className="text-fg-2">
        New to Fixly? <Link to={registerTo} className={LINK}>Create an account</Link>
      </p>
    </AuthFrame>
  )
}
