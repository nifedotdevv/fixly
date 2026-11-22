export const cn = (...parts) => parts.filter(Boolean).join(' ')

// Only transform, opacity and colour properties ever animate.
export const MOTION = 'transition-[transform,opacity,background-color,border-color,color] duration-(--duration-fast) ease-out'

export const CONTROL = cn(
  'w-full h-11 rounded-sm bg-surface-inset border border-border-strong px-3 text-fg',
  'placeholder:text-muted focus:border-accent aria-[invalid=true]:border-error',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  MOTION,
)
