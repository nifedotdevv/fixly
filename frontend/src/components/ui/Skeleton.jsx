import { cn } from './cn.js'
import './ui.css'

// Size it to the content it stands in for: <Skeleton className="h-5 w-40" />
export default function Skeleton({ className }) {
  return <div aria-hidden="true" className={cn('ui-pulse rounded-sm bg-surface-2', className)} />
}

// Rows matching DataRow height and padding. The caller wraps them in <Panel flush>.
export function SkeletonRows({ count = 4, compact = false }) {
  return (
    <ul aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          data-skeleton-row
          className={cn(
            'flex items-center gap-3 border-b border-border px-4 last:border-b-0 lg:gap-6 lg:px-6',
            compact ? 'min-h-10 py-2' : 'min-h-16 py-3',
          )}
        >
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </li>
      ))}
    </ul>
  )
}

// Title bar plus text lines, for inside a Panel.
export function SkeletonPanel({ lines = 3 }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      <Skeleton className="h-6 w-1/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}
