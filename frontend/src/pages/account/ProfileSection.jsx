import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Field, Input, useToast } from '../../components/ui/index.js'
import { api, ApiError } from '../../lib/api.js'
import { queryKeys } from '../../lib/queryClient.js'
import { Fields, Notice, Section, SectionFooter } from './shared.jsx'
import { fieldErrors, useFocusFirstInvalid } from './helpers.js'

export default function ProfileSection({ me }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const formRef = useRef(null)
  const [form, setForm] = useState({ firstName: me.firstName ?? '', lastName: me.lastName ?? '' })
  const [loading, setLoading] = useState(false)
  const [errs, setErrs] = useState({})
  const [failure, setFailure] = useState('')
  const [attempt, setAttempt] = useState(0)
  useFocusFirstInvalid(formRef, attempt)

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    setErrs({})
    setFailure('')
    const local = {}
    if (!form.firstName.trim()) local.firstName = 'Enter your first name'
    if (!form.lastName.trim()) local.lastName = 'Enter your last name'
    if (Object.keys(local).length) {
      setErrs(local)
      setAttempt((n) => n + 1)
      return
    }
    setLoading(true)
    try {
      const { data } = await api(`/users/${me.id}`, { method: 'PATCH', body: { firstName: form.firstName.trim(), lastName: form.lastName.trim() } })
      qc.setQueryData(queryKeys.me(), (old) =>
        old ? { ...old, data: { ...old.data, firstName: data.firstName, lastName: data.lastName } } : old)
      qc.invalidateQueries({ queryKey: ['artisans'] })
      toast({ title: 'Saved', tone: 'success' })
    } catch (err) {
      if (!(err instanceof ApiError)) throw err
      const mapped = fieldErrors(err.errors, ['firstName', 'lastName'])
      setErrs(mapped)
      if (!Object.keys(mapped).length) setFailure(err.message)
      setAttempt((n) => n + 1)
    }
    setLoading(false)
  }

  return (
    <Section title="Profile" description="The name artisans and homeowners see on your requests.">
      <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Fields>
          {failure && <Notice>{failure}</Notice>}
          <Field label="First name" error={errs.firstName}>
            <Input autoComplete="given-name" value={form.firstName} onChange={set('firstName')} />
          </Field>
          <Field label="Last name" error={errs.lastName}>
            <Input autoComplete="family-name" value={form.lastName} onChange={set('lastName')} />
          </Field>
        </Fields>
        <SectionFooter>
          <Button type="submit" loading={loading} loadingLabel="Saving…">Save name</Button>
        </SectionFooter>
      </form>
    </Section>
  )
}
