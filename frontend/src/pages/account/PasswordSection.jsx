import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, Field, Input } from '../../components/ui/index.js'
import { api, ApiError } from '../../lib/api.js'
import { clearSession } from '../../lib/session.js'
import { queryClient } from '../../lib/queryClient.js'
import { Fields, LegacyNotice, Notice, Section, SectionFooter } from './shared.jsx'
import { fieldErrors, useFocusFirstInvalid } from './helpers.js'
import { passwordValid } from './passwordRules.js'
import PasswordRuleList from './PasswordRuleList.jsx'

export default function PasswordSection() {
  const navigate = useNavigate()
  const formRef = useRef(null)
  const [form, setForm] = useState({ currentPassword: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [errs, setErrs] = useState({})
  const [failure, setFailure] = useState('')
  const [legacy, setLegacy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useFocusFirstInvalid(formRef, attempt)

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setErrs({})
    setFailure('')
    setLegacy(false)
    const local = {}
    if (!form.currentPassword) local.currentPassword = 'Enter your current password'
    if (!passwordValid(form.password)) local.password = 'Password does not meet every rule below'
    if (Object.keys(local).length) {
      setErrs(local)
      setAttempt((n) => n + 1)
      return
    }
    setLoading(true)
    try {
      await api('/users/me/password', {
        method: 'PATCH',
        authFailure: 'throw',
        body: { currentPassword: form.currentPassword, password: form.password, confirmPassword: form.password },
      })
      queryClient.clear()
      clearSession('ended')
      navigate('/login', { replace: true, state: { notice: 'Password changed. Sign in again.' } })
      return
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      if (err.status === 401) setErrs({ currentPassword: 'Current password is incorrect' })
      else if (err.status === 409) setLegacy(true)
      else if (err.status === 400) {
        const mapped = fieldErrors(err.errors, ['currentPassword', 'password'])
        setErrs(mapped)
        if (!Object.keys(mapped).length) setFailure(err.message)
      } else setFailure(err.message)
      setAttempt((n) => n + 1)
    }
    setLoading(false)
  }

  return (
    <Section title="Password" description="Changing it signs you out on every device.">
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Fields>
          {legacy && <LegacyNotice />}
          {failure && <Notice>{failure}</Notice>}
          <Field label="Current password" error={errs.currentPassword}>
            <Input type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} />
          </Field>
          <Field label="New password" error={errs.password}>
            <Input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} />
          </Field>
          <PasswordRuleList password={form.password} />
        </Fields>
        <SectionFooter>
          <Button type="submit" loading={loading} loadingLabel="Changing password…">Change password</Button>
        </SectionFooter>
      </form>
    </Section>
  )
}
