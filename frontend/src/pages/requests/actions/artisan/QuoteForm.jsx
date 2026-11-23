import { useState } from 'react'
import { Button, DateTimeInput, Field, MoneyInput, Textarea } from '../../../../components/ui/index.js'
import { zoneLabel } from '../../../../lib/time.js'
import { SplitBar } from '../../../../components/progress/index.js'
import FormErrors from './FormErrors.jsx'
import { splitQuote } from './splitQuote.js'
import { validateQuote } from './validateQuote.js'

export default function QuoteForm({ action, mutation }) {
  const [values, setValues] = useState({ scope: '', total: null, start: null, end: null, expiresAt: null })
  const [errors, setErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const set = (key) => (value) => {
    const next = { ...values, [key]: value }
    setValues(next)
    if (submitted) setErrors(validateQuote(next))
  }

  async function submit(e) {
    e.preventDefault()
    setSubmitted(true)
    const found = validateQuote(values)
    setErrors(found)
    if (Object.keys(found).length) return
    const body = {
      scope: values.scope.trim(),
      total: { amount: values.total, currency: 'NGN' },
      repairWindow: { start: values.start, end: values.end },
      expiresAt: values.expiresAt,
    }
    try {
      await mutation.mutateAsync({ action, body })
    } catch {
      // The hook keeps the error; FormErrors shows it and inputs stay as typed.
    }
  }

  const split = values.total >= 4 ? splitQuote(values.total) : null

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-5">
      <Field label="Scope of work" error={errors.scope}>
        <Textarea value={values.scope} maxLength={4000} onChange={(e) => set('scope')(e.target.value)} />
      </Field>
      <Field label="Total" error={errors.total}>
        <MoneyInput value={values.total} onChange={set('total')} />
      </Field>
      {split && (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-fg">Payment split</p>
          <SplitBar total={values.total} {...split} />
        </div>
      )}
      <p className="text-caption text-muted">Times are in {zoneLabel()}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Repair starts" error={errors.start}>
          <DateTimeInput hideZone onChange={set('start')} />
        </Field>
        <Field label="Repair ends" error={errors.end}>
          <DateTimeInput hideZone onChange={set('end')} />
        </Field>
      </div>
      <Field label="Quote valid until" helper="No later than the repair start." error={errors.expiresAt}>
        <DateTimeInput hideZone onChange={set('expiresAt')} />
      </Field>
      <FormErrors mutation={mutation} />
      <div>
        <Button type="submit" loading={mutation.isPending} loadingLabel="Sending…">Send quote</Button>
      </div>
    </form>
  )
}
