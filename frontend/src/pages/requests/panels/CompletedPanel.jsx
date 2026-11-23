import { Star } from 'lucide-react'
import { formatDateTime } from '../../../lib/time.js'

export default function CompletedPanel({ view }) {
  const { review } = view
  return (
    <section data-panel="completed" aria-labelledby="panel-completed" className="flex flex-col gap-3">
      <h2 id="panel-completed">Completed</h2>
      {review ? (
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 font-medium">
            <Star size={16} strokeWidth={1.75} aria-hidden="true" className="fill-accent text-ink" />
            <span>Review: {review.rating} out of 5</span>
          </p>
          {review.comment && <p className="max-w-[60ch] break-words whitespace-pre-line">{review.comment}</p>}
          {review.createdAt && <p className="text-caption text-fg-2">Left {formatDateTime(review.createdAt)}</p>}
        </div>
      ) : (
        <p className="max-w-[60ch] text-fg-2">The repair is done and settled. No review has been left yet.</p>
      )}
    </section>
  )
}
