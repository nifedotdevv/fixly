import { Loader2 } from 'lucide-react'
import { buttonClasses } from './buttonStyles.js'

export default function Button({
  variant = 'primary', size = 'default', loading = false, loadingLabel, disabled,
  type = 'button', className, children, onClick, ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={buttonClasses({ variant, size, className })}
      {...props}
    >
      {/* Both labels share one grid cell so the width never changes while loading. */}
      <span className="inline-grid">
        <span className={`col-start-1 row-start-1 ${loading ? 'invisible' : ''}`}>{children}</span>
        <span className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-2 ${loading ? '' : 'invisible'}`} aria-hidden={!loading}>
          <Loader2 size={16} strokeWidth={1.75} className="animate-spin" aria-hidden="true" />
          {loadingLabel ?? children}
        </span>
      </span>
    </button>
  )
}
