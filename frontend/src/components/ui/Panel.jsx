import { useId } from 'react'
import { cn } from './cn.js'

/**
 * White app panel. Never nest: a Panel must not contain another Panel.
 * `flush` removes body padding so rows can run edge to edge; the title row keeps its padding.
 */
export default function Panel({
  title, titleAs: TitleTag = 'h2', action, description, flush = false, as: Tag = 'section',
  className, children, ...rest
}) {
  const titleId = useId()
  const labelled = title && Tag === 'section'
  const hasHead = title || action
  return (
    <Tag
      aria-labelledby={labelled ? titleId : undefined}
      className={cn('rounded-lg border border-border bg-surface shadow-card', !flush && 'p-5 lg:p-6', className)}
      {...rest}
    >
      {hasHead && (
        <div className={cn(
          'flex items-start justify-between gap-4',
          flush ? 'border-b border-border px-5 py-4 lg:px-6' : (children != null && 'mb-4'),
        )}>
          <div className="min-w-0">
            {title && <TitleTag id={titleId} className="text-h3">{title}</TitleTag>}
            {description && <p className="mt-1 text-small text-muted">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </Tag>
  )
}
