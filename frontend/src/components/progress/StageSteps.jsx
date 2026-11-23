import { useState } from 'react'
import { Ban, Check, CircleAlert, Clock } from 'lucide-react'
import { MILESTONES, milestoneFor, statusMeta } from '../../lib/requestStatus.js'
import { formatRelative, formatDateTime } from '../../lib/time.js'
import { useCountdown } from '../../lib/useCountdown.js'
import { cn } from '../ui/cn.js'

const COUNT = MILESTONES.length
const FADE = 'transition-[background-color,border-color] duration-(--duration-slow) ease-(--ease-out)'

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

function Marker({ state, ended, problem, fade }) {
  const base = cn('relative z-10 flex size-6 items-center justify-center rounded-full', fade && FADE)
  if (state === 'upcoming') return <span className={cn(base, 'border border-border-strong bg-surface')} />
  if (state === 'current' && problem) {
    return (
      <span data-testid="steps-problem" className={cn(base, 'bg-error text-on-ink')}>
        <CircleAlert size={14} strokeWidth={1.75} />
      </span>
    )
  }
  if (state === 'current' && ended) {
    return (
      <span data-testid="steps-ended" className={cn(base, 'bg-muted text-on-ink')}>
        <Ban size={14} strokeWidth={1.75} />
      </span>
    )
  }
  if (state === 'current') {
    return (
      <span className={cn(base, 'bg-accent ring-2 ring-ink')}>
        <span className="size-1.5 rounded-full bg-on-bright" />
      </span>
    )
  }
  return (
    <span className={cn(base, 'text-on-ink', ended ? 'bg-muted' : 'bg-ink')}>
      <Check size={14} strokeWidth={1.75} />
    </span>
  )
}

// The mini variant is aria-hidden and carries no text, so it must always sit beside a StatusBadge
// that states the status in words.
export default function StageSteps({ status, view, deadline = null, size = 'full' }) {
  const milestone = milestoneFor({ ...view, status })
  const { tone, label } = statusMeta(status)
  const ended = tone === 'ended'
  const problem = status === 'problem_reported'
  const completed = status === 'completed'
  const mini = size === 'mini'

  // Colour changes animate only after the status changes; the first render has no transition.
  const [prev, setPrev] = useState({ status, changed: false })
  if (prev.status !== status) setPrev({ status, changed: true })
  const fade = prev.changed

  const countdown = useCountdown(mini ? null : deadline)
  const fill = ended ? 'bg-muted' : 'bg-ink'

  const segments = (height, gap) => (
    <div className={cn('flex w-full', gap)} aria-hidden="true">
      {MILESTONES.map((name, i) => (
        <span
          key={name}
          className={cn('flex-1 rounded-full', height, fade && FADE, i <= milestone ? fill : 'bg-border-strong')}
        />
      ))}
    </div>
  )

  if (mini) return <div aria-hidden="true">{segments('h-1', 'gap-0.5')}</div>

  const stageLine = `Stage ${milestone + 1} of ${COUNT}: ${MILESTONES[milestone]}`

  return (
    <div role="img" aria-label={describe({ status, deadline, milestone, label })} className="w-full">
      <ol className="hidden sm:flex" aria-hidden="true">
        {MILESTONES.map((name, i) => {
          const state = completed || i < milestone ? 'done' : i === milestone ? 'current' : 'upcoming'
          const lineClass = (on) => cn('absolute top-1/2 h-0.5 -translate-y-1/2', fade && FADE, on ? fill : 'bg-border')
          return (
            <li key={name} className="flex w-1/7 flex-col items-center">
              <div className="relative flex w-full justify-center">
                {i > 0 && <span className={cn(lineClass(i <= milestone), 'left-0 right-1/2')} />}
                {i < COUNT - 1 && <span className={cn(lineClass(i + 1 <= milestone), 'left-1/2 right-0')} />}
                <Marker state={state} ended={ended} problem={problem} fade={fade} />
              </div>
              <span
                className={cn(
                  'mt-1 px-1 text-center text-caption text-balance',
                  state === 'current' ? 'font-medium text-fg' : state === 'done' ? 'text-fg-2' : 'text-muted',
                )}
              >
                {name}
              </span>
            </li>
          )
        })}
      </ol>

      <div className="sm:hidden">{segments('h-1.5', 'gap-1')}</div>

      <div className="mt-2 space-y-1 text-caption" aria-hidden="true">
        <p className={cn('font-display tabular-nums text-fg', !ended && !problem && 'sm:hidden')}>
          {ended ? `Ended at stage ${milestone + 1} of ${COUNT}: ${MILESTONES[milestone]}` : stageLine}
        </p>
        {problem && <p className="text-error">Problem reported at this stage</p>}
        {deadline && (
          <p data-testid="steps-deadline" className="flex items-center gap-2 text-warning">
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
