import { cn, MOTION } from './cn.js'

const VARIANTS = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'bg-surface text-fg border border-border-strong hover:bg-surface-inset',
  tertiary: 'bg-transparent text-accent hover:text-accent-hover hover:underline underline-offset-4',
  destructive: 'bg-error text-accent-fg hover:opacity-90',
}
const SIZES = { default: 'h-11 px-4', compact: 'h-9 px-3 text-caption' }

export function buttonClasses({ variant = 'primary', size = 'default', className } = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-sm font-medium whitespace-nowrap select-none',
    'active:scale-[0.98] aria-disabled:opacity-50 aria-disabled:pointer-events-none disabled:opacity-50 disabled:pointer-events-none',
    MOTION, VARIANTS[variant], SIZES[size], className,
  )
}
