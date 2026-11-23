import { cn } from './cn.js'

/**
 * The page's single h1. RouteFocus finds it with `main h1` and sets tabindex itself,
 * so tabIndex={-1} here just makes it focusable from the start; `h1Ref` is available too.
 */
export default function PageHeader({ title, summary, actions, children, className, h1Ref }) {
  return (
    <header className={cn('mb-6 lg:mb-8', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 ref={h1Ref} tabIndex={-1} className="text-h1 break-words outline-none">{title}</h1>
          {summary && <p aria-live="polite" className="mt-2 text-body text-muted">{summary}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  )
}
