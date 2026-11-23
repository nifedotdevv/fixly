import { cn } from './cn.js'

const BASE = 'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-caption font-medium whitespace-nowrap'

export default function Badge({ className, children }) {
  return <span className={cn(BASE, 'bg-surface-2 text-fg-2', className)}>{children}</span>
}

