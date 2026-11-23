import { useState } from 'react'
import { Button, ConfirmDialog, Field, Textarea } from '../../../../components/ui/index.js'
import { MAX, counter, messageOf } from './useTextField.js'

export default function ProblemForm({ action, mutation }) {
  const [explanation, setExplanation] = useState('')
  const trimmed = explanation.trim()
  const valid = trimmed.length >= 1 && explanation.length <= MAX
  const message = messageOf(mutation)

  // A rejection keeps the dialog open so the error shows; a 409 resolves and closes it.
  const send = async () => {
    const result = await mutation.mutateAsync({ action, body: { explanation: trimmed } })
    if (result) setExplanation('')
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <Field label="What's wrong?" error={message}>
        <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} maxLength={MAX} />
      </Field>
      <p className="tabular text-caption text-muted">{counter(explanation.length)}</p>
      <div>
        <ConfirmDialog
          trigger={<Button variant="destructive" disabled={!valid}>{action.label}</Button>}
          title="Report a problem?"
          description="Fixly support will review the job. Neither of you can complete it until support resolves it."
          confirmLabel="Report problem"
          loadingLabel="Reporting…"
          tone="destructive"
          onConfirm={send}
          error={message}
        />
      </div>
    </div>
  )
}
