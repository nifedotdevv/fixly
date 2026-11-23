import { useState } from 'react'
import { Button, ConfirmDialog, Field, Textarea } from '../../../../components/ui/index.js'
import FormErrors from './FormErrors.jsx'

const MAX = 500

export default function RejectForm({ action, mutation }) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)
  const [open, setOpen] = useState(false)
  const trimmed = reason.trim()
  const error = touched && !trimmed ? 'Give the homeowner a reason' : undefined

  function review() {
    setTouched(true)
    if (trimmed) setOpen(true)
  }

  // Rejects on failure, so the dialog stays open and shows the message.
  const confirm = () => mutation.mutateAsync({ action, body: { reason: trimmed } })

  return (
    <div className="flex max-w-md flex-col gap-4">
      <Field label="Reason" helper={`${reason.length}/${MAX} characters`} error={error}>
        <Textarea value={reason} maxLength={MAX} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <FormErrors mutation={mutation} />
      <div>
        <Button variant="destructive" onClick={review}>Decline request</Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Decline this request?"
        description="The homeowner is told why. This cannot be undone."
        confirmLabel="Decline request"
        loadingLabel="Declining…"
        tone="destructive"
        onConfirm={confirm}
        error={mutation.errors?.[0] ?? mutation.error?.message}
      />
    </div>
  )
}
