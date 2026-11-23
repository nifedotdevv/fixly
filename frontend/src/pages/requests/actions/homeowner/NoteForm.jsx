import { useState } from 'react'
import { Button, Field, Textarea } from '../../../../components/ui/index.js'
import { MAX, counter, messageOf } from './useTextField.js'

export default function NoteForm({ action, mutation }) {
  const [text, setText] = useState('')
  const trimmed = text.trim()
  const valid = trimmed.length >= 1 && text.length <= MAX

  async function submit(e) {
    e.preventDefault()
    if (!valid) return
    try {
      const result = await mutation.mutateAsync({ action, body: { text: trimmed } })
      if (result) setText('')
    } catch {
      // The error is shown from mutation.errors; the text stays.
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-3">
      <Field
        label="Add a note for the artisan"
        helper="Notes are one-way. The artisan can read them but can't reply in Fixly."
        error={messageOf(mutation)}
      >
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX} />
      </Field>
      <p className="tabular text-caption text-muted">{counter(text.length)}</p>
      <div>
        <Button type="submit" variant="secondary" disabled={!valid} loading={mutation.isPending} loadingLabel="Adding note…">
          Add note
        </Button>
      </div>
    </form>
  )
}
