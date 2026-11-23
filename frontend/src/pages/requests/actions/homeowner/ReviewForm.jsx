import { useId, useRef, useState } from 'react'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { CircleAlert, Star } from 'lucide-react'
import { Button, Field, Textarea } from '../../../../components/ui/index.js'
import { MOTION } from '../../../../components/ui/cn.js'
import { MAX, counter, messageOf } from './useTextField.js'

const STARS = [1, 2, 3, 4, 5]

function Rating({ value, onChange, error, groupRef }) {
  const errorId = useId()
  return (
    <div className="flex flex-col gap-2">
      <span id="rating-label" className="font-medium text-fg">Rating</span>
      <RadioGroup.Root
        ref={groupRef}
        aria-labelledby="rating-label"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        value={value ? String(value) : ''}
        onValueChange={(v) => onChange(Number(v))}
        orientation="horizontal"
        className="flex items-center gap-1"
      >
        {STARS.map((n) => (
          <RadioGroup.Item
            key={n}
            value={String(n)}
            aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            className={`flex size-11 items-center justify-center rounded-sm ${MOTION}`}
          >
            <Star size={28} strokeWidth={1.75} aria-hidden="true" className={n <= value ? 'fill-accent text-ink' : 'fill-transparent text-border-strong'} />
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      <p aria-live="polite" className="tabular text-caption text-fg-2">
        {value ? `${value} out of 5` : 'Choose a rating from 1 to 5'}
      </p>
      {error && (
        <p id={errorId} className="flex items-start gap-2 text-caption text-error">
          <CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

export default function ReviewForm({ action, mutation }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [touched, setTouched] = useState(false)
  const group = useRef(null)

  async function submit(e) {
    e.preventDefault()
    setTouched(true)
    if (!rating) {
      group.current?.querySelector('[role="radio"]')?.focus()
      return
    }
    try {
      await mutation.mutateAsync({ action, body: { rating, comment: comment.trim() } })
    } catch {
      // The error is shown from mutation.errors; the input stays.
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
      <Rating value={rating} onChange={setRating} groupRef={group} error={touched && !rating ? 'Choose a rating.' : undefined} />
      <Field label="Comment (optional)" helper="Reviews can't be edited after you submit." error={messageOf(mutation)}>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={MAX} />
      </Field>
      <p className="tabular text-caption text-muted">{counter(comment.length)}</p>
      <div>
        <Button type="submit" loading={mutation.isPending} loadingLabel="Submitting review…">
          Submit review
        </Button>
      </div>
    </form>
  )
}
