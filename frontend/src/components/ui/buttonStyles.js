import { cn, MOTION } from './cn.js'

// Ranked by importance, styled after calendly.com: a solid navy fill for the main action,
// a 1px navy outline for the second one, and a light fill for buttons that sit on a gradient.
const VARIANTS = {
  primary: 'bg-ink text-on-ink hover:bg-ink-hover',
  ink: 'bg-ink text-on-ink hover:bg-ink-hover',
  secondary: 'bg-transparent text-fg border border-ink hover:bg-tint',
  light: 'bg-on-band text-on-bright border border-on-band hover:bg-on-band/90',
  lemon: 'bg-accent text-accent-fg hover:bg-accent-hover',
  tertiary: 'link bg-transparent',
  destructive: 'bg-error text-on-ink hover:opacity-90',
}
const SIZES = {
  default: 'h-11 px-4 rounded-md text-small',
  compact: 'h-9 px-3 rounded-sm text-caption',
  large: 'h-12.5 px-5 rounded-lg text-body',
}

export function buttonClasses({ variant = 'primary', size = 'default', className } = {}) {
  return cn(
    'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap select-none',
    'active:scale-[0.98] aria-disabled:opacity-50 aria-disabled:pointer-events-none disabled:opacity-50 disabled:pointer-events-none',
    MOTION, VARIANTS[variant], SIZES[size], className,
  )
}
