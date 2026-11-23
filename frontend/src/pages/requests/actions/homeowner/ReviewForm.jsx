import { useState } from 'react'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { Star } from 'lucide-react'
import { Button, Field, Textarea } from '../../../../components/ui/index.js'
import { MOTION } from '../../../../components/ui/cn.js'
import { MAX, counter, messageOf } from './useTextField.js'

const STARS = [1, 2, 3, 4, 5]

function Rating({ value, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      <span id="rating-label" className="font-medium text-fg">Rating</span>
      <RadioGroup.Root
        aria-labelledby="rating-label"
        value={value ? String(value) : ''}
        onValueChange={(v) => onChange(Number(v))}
        orientation="horizontal"
        className="flex items-center gap-1"
      >
        {STARS.map((n) => (
          <RadioGroup.Item
            key={n}
            value={String(n)}
            aria-label={`${n} out of 5`}
            className={`flex size-11 items-center justify-center rounded-sm text-muted hover:text-accent data-[state=checked]:text-accent ${MOTION}`}
          >
            <Star size={28} strokeWidth={1.75} aria-hidden="true" fill={n <= value ? 'currentColor' : 'none'} className={n <= value ? 'text-accent' : ''} />
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      <p aria-live="polite" className="tabular text-caption text-fg-2">
        {value ? `${value} out of 5` : 'Choose a rating from 1 to 5'}
      </p>
    </div>
  )
}

export default function ReviewForm({ action, mutation }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!rating) return
    try {
      await mutation.mutateAsync({ action, body: { rating, comment: comment.trim() } })
    } catch {
      // The error is shown from mutation.errors; the input stays.
    }
  }

  return (
    <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
      <Rating value={rating} onChange={setRating} />
      <Field label="Comment (optional)" helper="Reviews can't be edited after you submit." error={messageOf(mutation)}>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={MAX} />
      </Field>
      <p className="tabular text-caption text-muted">{counter(comment.length)}</p>
      <div>
        <Button type="submit" disabled={!rating} loading={mutation.isPending} loadingLabel="Submitting review…">
          Submit review
        </Button>
      </div>
    </form>
  )
}
