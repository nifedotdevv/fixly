import { cn } from './cn.js'
import './ui.css'

// Size it to the content it stands in for: <Skeleton className="h-5 w-40" />
export default function Skeleton({ className }) {
  return <div aria-hidden="true" className={cn('ui-pulse rounded-sm bg-surface-inset', className)} />
}
