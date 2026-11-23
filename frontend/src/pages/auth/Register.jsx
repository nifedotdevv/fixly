import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button, Field, Input, LinkButton } from '../../components/ui/index.js'
import { api, ApiError } from '../../lib/api.js'
import { safeNext } from '../../auth/roles.js'
import AuthFrame from './AuthFrame.jsx'
import PasswordRuleList from '../account/PasswordRuleList.jsx'
import { passwordValid } from '../account/passwordRules.js'

const LINK = 'link'
const ROLES = [
  { value: 'house_owner', label: 'I need work done' },
  { value: 'artisan', label: 'I do the work' },
]

export default function Register() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [role, setRole] = useState(params.get('role') === 'artisan' ? 'artisan' : 'house_owner')
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', previousPassword: '' })
  const [hasPrevious, setHasPrevious] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [conflict, setConflict] = useState(null)
  const [errors, setErrors] = useState([])
  const [failure, setFailure] = useState('')

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }))
  const rulesMet = passwordValid(form.password)
  const loginTo = next ? `/login?next=${encodeURIComponent(next)}` : '/login'

  async function onSubmit(e) {
    e.preventDefault()
    setConflict(null)
    setErrors([])
    setFailure('')
    if (!rulesMet) {
      setErrors([{ field: 'password', message: 'Password does not meet every rule below' }])
      return
    }
    setLoading(true)
    const body = { ...form, role }
    if (!hasPrevious || !body.previousPassword) delete body.previousPassword
    try {
      await api('/auth/register', { method: 'POST', body, auth: false })
      setDone(true)
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      if (err.status === 409) setConflict(err.data?.isDeactivated ? { days: err.data.daysRemaining } : {})
      else if (err.status === 400 && err.errors.length) setErrors(err.errors)
      else setFailure(err.message)
      setLoading(false)
    }
  }

  if (done) {
    return (
      <AuthFrame title="Check your inbox">
        <p role="status" className="text-fg-2">Check your inbox to verify your email, then sign in.</p>
        <LinkButton to={loginTo} className="self-start">Sign in</LinkButton>
      </AuthFrame>
    )
  }

  const fieldError = (name) => errors.find((x) => x.field === name)?.message
  const unmatched = errors.filter((x) => !['firstName', 'lastName', 'email', 'password'].includes(x.field))

  return (
    <AuthFrame title="Create your account" intro="Book an inspection or take on jobs.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {conflict?.days !== undefined && (
          <div role="alert" className="flex flex-col gap-1 rounded-sm bg-warning-soft p-3 text-fg">
            <p className="font-medium">Still recoverable for {conflict.days} days</p>
            <p>This email belongs to a deleted account. <Link to="/reactivate" className={LINK}>Reactivate it</Link></p>
          </div>
        )}
        {conflict && conflict.days === undefined && (
          <div role="alert" className="flex flex-col gap-1 rounded-sm bg-error-soft p-3 text-fg">
            <p className="font-medium">An account with this email already exists</p>
            <p>
              <Link to={loginTo} className={LINK}>Sign in</Link>{' '}
              <Link to="/forgot-password" className={LINK}>Forgot your password?</Link>
            </p>
          </div>
        )}
        {failure && <p role="alert" className="rounded-sm bg-error-soft p-3 text-fg">{failure}</p>}
        {unmatched.length > 0 && (
          <ul role="alert" className="rounded-sm bg-error-soft p-3 text-fg">
            {unmatched.map((x, i) => <li key={i}>{x.message}</li>)}
          </ul>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-medium text-fg">I am joining Fixly as</legend>
          {ROLES.map((r) => (
            <label key={r.value} className="flex min-h-11 items-center gap-3 rounded-sm border border-border-strong bg-surface px-3 has-checked:border-ink has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink">
              <input type="radio" name="role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} className="accent-ink" />
              {r.label}
            </label>
          ))}
        </fieldset>
        <Field label="First name" error={fieldError('firstName')}>
          <Input autoComplete="given-name" required value={form.firstName} onChange={set('firstName')} />
        </Field>
        <Field label="Last name" error={fieldError('lastName')}>
          <Input autoComplete="family-name" required value={form.lastName} onChange={set('lastName')} />
        </Field>
        <Field label="Email" error={fieldError('email')}>
          <Input type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Password" error={fieldError('password')}>
          <Input type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} />
        </Field>
        <PasswordRuleList password={form.password} />
        <div>
          <button
            type="button"
            aria-expanded={hasPrevious}
            onClick={() => setHasPrevious((v) => !v)}
            className="link"
          >
            I deleted a Fixly account with this email before
          </button>
        </div>
        {hasPrevious && (
          <Field label="Previous password" helper="The password of the deleted account. It lets us start your new account fresh.">
            <Input type="password" autoComplete="off" value={form.previousPassword} onChange={set('previousPassword')} />
          </Field>
        )}
        <Button type="submit" loading={loading} loadingLabel="Creating account…" className="self-start">Create account</Button>
      </form>
      <p className="text-fg-2">
        Already have an account? <Link to={loginTo} className={LINK}>Sign in</Link>
      </p>
    </AuthFrame>
  )
}
