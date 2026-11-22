import { Ban, CalendarCheck, CircleAlert, CircleCheck, Clock, Hourglass, Wrench } from 'lucide-react'
import { cn } from './cn.js'

const BASE = 'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-caption font-medium whitespace-nowrap'

const TONES = {
  waiting: { Icon: Hourglass, cls: 'bg-info-soft text-info' },
  clock: { Icon: Clock, cls: 'bg-warning-soft text-warning' },
  booked: { Icon: CalendarCheck, cls: 'bg-accent-soft text-accent' },
  working: { Icon: Wrench, cls: 'bg-surface-inset text-ink' },
  attention: { Icon: CircleAlert, cls: 'bg-error-soft text-error' },
  done: { Icon: CircleCheck, cls: 'bg-success-soft text-success' },
  ended: { Icon: Ban, cls: 'bg-surface-inset text-muted' },
}

export default function StatusBadge({ tone, children, className }) {
  const { Icon, cls } = TONES[tone] ?? TONES.ended
  return (
    <span className={cn(BASE, cls, className)}>
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </span>
  )
}
