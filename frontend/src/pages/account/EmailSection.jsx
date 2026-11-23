import { useRef, useState } from 'react'
import { Button, Field, Input } from '../../components/ui/index.js'
import { api, ApiError } from '../../lib/api.js'
import { Fields, LegacyNotice, Notice, Section, SectionFooter } from './shared.jsx'
import { fieldErrors, useFocusFirstInvalid } from './helpers.js'

export default function EmailSection({ me }) {
  const formRef = useRef(null)
  const [form, setForm] = useState({ currentPassword: '', email: '' })
  const [loading, setLoading] = useState(false)
  const [errs, setErrs] = useState({})
  const [failure, setFailure] = useState('')
  const [legacy, setLegacy] = useState(false)
  const [sentTo, setSentTo] = useState('')
  const [attempt, setAttempt] = useState(0)
  useFocusFirstInvalid(formRef, attempt)

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setErrs({})
    setFailure('')
    setLegacy(false)
    setSentTo('')
    const local = {}
    if (!form.currentPassword) local.currentPassword = 'Enter your current password'
    if (!form.email.trim()) local.email = 'Enter the new email address'
    if (Object.keys(local).length) {
      setErrs(local)
      setAttempt((n) => n + 1)
      return
    }
    setLoading(true)
    const email = form.email.trim()
    try {
      await api('/users/me/email-change', { method: 'POST', authFailure: 'throw', body: { currentPassword: form.currentPassword, email } })
      setSentTo(email)
      setForm({ currentPassword: '', email: '' })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      if (err.status === 401) setErrs({ currentPassword: 'Current password is incorrect' })
      else if (err.status === 409 && /reset your password/i.test(err.message)) setLegacy(true)
      else if (err.status === 409) setErrs({ email: 'That email address is already in use' })
      else if (err.status === 503) setFailure("Email can't be sent right now. Try again later.")
      else if (err.status === 400) {
        const mapped = fieldErrors(err.errors, ['email', 'currentPassword'])
        setErrs(mapped)
        if (!Object.keys(mapped).length) setFailure(err.message)
      } else setFailure(err.message)
      setAttempt((n) => n + 1)
    }
    setLoading(false)
  }

  return (
    <Section title="Email" description="Your current email stays active until you confirm the new one.">
      <p className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-medium">{me.email}</span>
        {me.emailVerified === false && <span className="rounded-sm bg-warning-soft px-2 py-0.5 text-caption text-fg">Not verified</span>}
      </p>
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Fields>
          {sentTo && <Notice tone="success">Confirm from the link we sent to {sentTo}. Your current email stays active until then.</Notice>}
          {legacy && <LegacyNotice />}
          {failure && <Notice>{failure}</Notice>}
          <Field label="Current password" error={errs.currentPassword}>
            <Input type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} />
          </Field>
          <Field label="New email" error={errs.email}>
            <Input type="email" autoComplete="email" value={form.email} onChange={set('email')} />
          </Field>
        </Fields>
        <SectionFooter>
          <Button type="submit" loading={loading} loadingLabel="Sending link…">Change email</Button>
        </SectionFooter>
      </form>
    </Section>
  )
}
