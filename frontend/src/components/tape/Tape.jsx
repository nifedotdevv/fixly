import { useState } from 'react'
import { Clock } from 'lucide-react'
import { MILESTONES, milestoneFor, statusMeta } from '../../lib/requestStatus.js'
import { formatRelative, formatDateTime } from '../../lib/time.js'
import { useCountdown } from '../../lib/useCountdown.js'
import { cn } from '../ui/cn.js'
import './tape.css'

const COUNT = MILESTONES.length
// Each milestone owns one equal column; its tick sits at the column centre.
const pos = (i) => ((i + 0.5) / COUNT) * 100

const FILL = { done: 'bg-success', ended: 'bg-muted' }

function describe({ status, deadline, milestone, label }) {
  const stage = `${milestone + 1} of ${COUNT}`
  const here = MILESTONES[milestone]
  const { tone } = statusMeta(status)
  let text
  if (tone === 'ended') text = `Ended at stage ${stage}: ${here}. ${label}.`
  else if (status === 'problem_reported') text = `Stage ${stage}: ${here}. Problem reported, support is reviewing.`
  else if (status === 'completed') text = `Stage ${stage}: ${here}. Complete.`
  else {
    const next = MILESTONES[milestone + 1]
    text = `Stage ${stage}: ${here}.${next ? ` Next: ${next}.` : ''}`
  }
  if (deadline) text += ` Ends ${formatDateTime(deadline)}, ${formatRelative(deadline)}.`
  return text
}

// The mini tape is aria-hidden and carries no text, so it must always sit beside a StatusBadge
// that states the status in words.
export default function Tape({ status, view, deadline = null, size = 'full' }) {
  const milestone = milestoneFor({ ...view, status })
  const { tone, label } = statusMeta(status)
  const to = pos(milestone) / 100
  const ended = tone === 'ended'
  const problem = status === 'problem_reported'
  const mini = size === 'mini'

  // Grow only when status changes after mount; the first render has no animation class.
  const [prev, setPrev] = useState({ status, to, from: to, key: 0 })
  if (prev.status !== status) setPrev({ status, to, from: prev.to, key: prev.key + 1 })
  const animated = prev.key > 0

  const countdown = useCountdown(mini ? null : deadline)
  const fillClass = cn('tape-fill absolute inset-x-0 top-0', FILL[tone] ?? 'bg-ink', animated && 'tape-fill--grow')
  const fillStyle = { '--tape-to': to, '--tape-from': prev.from }

  if (mini) {
    return (
      <div aria-hidden="true" className="relative h-1 w-full overflow-hidden rounded-sm bg-surface-inset">
        <div key={prev.key} className={cn(fillClass, 'h-full')} style={fillStyle} />
      </div>
    )
  }

  const segmentMid = pos(Math.min(milestone + 0.5, COUNT - 1))
  const stageLine = `Stage ${milestone + 1} of ${COUNT}: ${MILESTONES[milestone]}`

  return (
    <div
      role="img"
      aria-label={describe({ status, deadline, milestone, label })}
      className="w-full"
    >
      <div className="relative h-7 w-full overflow-hidden rounded-sm border border-border bg-surface-inset">
        <div key={prev.key} className={cn(fillClass, 'h-5')} style={fillStyle} />
        <div className="tape-minor-ticks absolute inset-x-0 bottom-0 h-2" />
        {MILESTONES.map((name, i) => (
          <span
            key={name}
            className="absolute bottom-0 h-3.5 w-0.5 -translate-x-1/2 bg-ink"
            style={{ left: `${pos(i)}%` }}
          />
        ))}
        {ended && (
          <span
            data-testid="tape-ended"
            className="absolute inset-y-0 w-1 -translate-x-1/2 bg-fg-2"
            style={{ left: `${pos(milestone)}%` }}
          />
        )}
        {problem && (
          <span
            data-testid="tape-problem"
            className="absolute inset-y-0 w-1 -translate-x-1/2 bg-error"
            style={{ left: `${pos(milestone)}%` }}
          />
        )}
        {deadline && (
          <span
            data-testid="tape-notch"
            className="absolute inset-y-0 w-1 -translate-x-1/2 bg-warning-mark"
            style={{ left: `${segmentMid}%` }}
          />
        )}
      </div>

      <div className="mt-1 hidden sm:flex" aria-hidden="true">
        {MILESTONES.map((name, i) => (
          <span
            key={name}
            className={cn(
              'w-1/7 px-1 text-center text-caption text-balance',
              i === milestone ? 'font-medium text-fg' : i < milestone ? 'text-fg-2' : 'text-muted',
            )}
          >
            {name}
          </span>
        ))}
      </div>

      <div className="mt-2 space-y-1 text-caption" aria-hidden="true">
        <p className={cn('font-display tabular-nums text-fg', !ended && !problem && 'sm:hidden')}>
          {ended ? `Ended at stage ${milestone + 1} of ${COUNT}: ${MILESTONES[milestone]}` : stageLine}
        </p>
        {problem && <p className="text-error">Problem reported at this stage</p>}
        {deadline && (
          <p className="flex items-center gap-2 text-warning">
            <Clock size={16} strokeWidth={1.75} className="shrink-0" />
            <span className="tabular-nums">
              {countdown.expired
                ? `Ended ${formatDateTime(deadline)}`
                : `Ends ${formatDateTime(deadline)}, ${formatRelative(deadline)}`}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
