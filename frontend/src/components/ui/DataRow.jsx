import { Link } from 'react-router'
import { cn } from './cn.js'

/**
 * One row of a list inside <Panel flush>. Put it in a <ul>; it renders the <li>.
 * With `to` the whole row is a single link. Without it (or with as="div") the row is read-only.
 * `columns` is a full Tailwind grid template for >=1024px, e.g. "lg:grid-cols-[minmax(0,2fr)_auto]".
 * Below 1024px cells sit in a flex row; give a cell `min-w-0 flex-1` to let it take the slack.
 */
export default function DataRow({
  to, as, selected = false, 'aria-current': ariaCurrent, columns, compact = false,
  className, children, ...rest
}) {
  const Inner = as === 'div' || !to ? 'div' : Link
  const linkProps = Inner === Link ? { to } : {}
  return (
    <li className="border-b border-divider/70 last:border-b-0">
      <Inner
        {...linkProps}
        aria-current={selected ? (ariaCurrent ?? 'true') : undefined}
        className={cn(
          // Cells may reorder with `order-*` to wrap on phones; the grid always uses source order.
          'relative flex items-center gap-3 px-4 text-left lg:grid lg:gap-6 lg:px-6 lg:*:order-none',
          compact ? 'min-h-10 py-2 text-small' : 'min-h-16 py-3',
          columns,
          selected ? 'bg-lime-soft' : (Inner === Link && 'hover:bg-surface-2'),
          Inner === Link && 'transition-colors duration-(--duration-fast) ease-out -outline-offset-2',
          selected && 'before:absolute before:inset-y-0 before:start-0 before:w-[3px] before:bg-lime',
          className,
        )}
        {...rest}
      >
        {children}
      </Inner>
    </li>
  )
}

export function DataCell({ align = 'start', numeric = false, className, children, ...rest }) {
  return (
    <div
      className={cn('min-w-0', align === 'end' && 'text-right', numeric && 'tabular', className)}
      {...rest}
    >
      {children}
    </div>
  )
}

DataRow.Cell = DataCell
