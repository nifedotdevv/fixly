import { ChevronDown } from 'lucide-react'
import { CONTROL, cn } from './cn.js'

// Native <select> so it stays reliable on low-end phones. `className` lands on the
// select; `wrapperClassName` styles the relative container (width, margin).
export default function Select({ className, wrapperClassName, children, ...props }) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select className={cn(CONTROL, 'peer appearance-none pr-10', className)} {...props}>{children}</select>
      <ChevronDown
        size={20}
        strokeWidth={1.75}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-2 peer-disabled:opacity-50"
      />
    </div>
  )
}
