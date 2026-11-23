import { useState } from 'react'
import { Button, Field, MoneyInput } from '../../../../components/ui/index.js'
import { formatMoney } from '../../../../lib/money.js'
import FormErrors from './FormErrors.jsx'

export default function AcceptForm({ action, mutation }) {
  const [fee, setFee] = useState(null)
  const [touched, setTouched] = useState(false)
  const error = touched && !(fee >= 1) ? `Enter an inspection fee of at least ${formatMoney({ amount: 1 })}` : undefined

  async function submit(e) {
    e.preventDefault()
    setTouched(true)
    if (!(fee >= 1)) return
    try {
      await mutation.mutateAsync({ action, body: { inspectionFee: { amount: fee, currency: 'NGN' } } })
    } catch {
      // The hook keeps the error; FormErrors shows it and the input stays as typed.
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-md flex-col gap-4">
      <Field label="Inspection fee" helper="The homeowner pays this to confirm the inspection." error={error}>
        <MoneyInput value={fee} onChange={setFee} />
      </Field>
      <FormErrors mutation={mutation} />
      <div>
        <Button type="submit" loading={mutation.isPending} loadingLabel="Accepting…">Accept request</Button>
      </div>
    </form>
  )
}
