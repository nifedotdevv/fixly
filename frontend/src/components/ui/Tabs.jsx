import * as RadixTabs from '@radix-ui/react-tabs'
import { useSearchParams } from 'react-router'
import { cn, MOTION } from './cn.js'

/**
 * Underline tabs for app pages.
 *
 *   <Tabs label="Request groups" param="tab" defaultValue="needs-you"
 *     items={[{ value: 'needs-you', label: 'Needs you', count: 1 }, { value: 'finished', label: 'Finished' }]}>
 *     {(active) => <RequestList group={active} />}
 *   </Tabs>
 *
 * - `items`: `{ value, label, count? }`. A numeric `count` shows a chip; screen readers hear "Needs you, 1".
 * - `children(value)`: render function called inside each tab's panel (only the active panel is mounted).
 * - `param`: sync the active tab to `?param=value` (replace, other params kept). Unknown or missing
 *   values fall back to `defaultValue` (default: first item). Needs a Router.
 * - Without `param`: controlled via `value` / `onValueChange`, or uncontrolled via `defaultValue`.
 */
export default function Tabs({ param, items, defaultValue, ...rest }) {
  const first = defaultValue ?? items[0]?.value
  return param
    ? <ParamTabs param={param} items={items} fallback={first} {...rest} />
    : <TabsView items={items} defaultValue={first} {...rest} />
}

function ParamTabs({ param, items, fallback, ...rest }) {
  const [params, setParams] = useSearchParams()
  const raw = params.get(param)
  const value = items.some((i) => i.value === raw) ? raw : fallback
  const onValueChange = (next) => {
    const p = new URLSearchParams(params)
    p.set(param, next)
    setParams(p, { replace: true })
  }
  return <TabsView items={items} value={value} onValueChange={onValueChange} {...rest} />
}

function TabsView({ items, label, children, className, ...rootProps }) {
  return (
    <RadixTabs.Root className={className} {...rootProps}>
      <RadixTabs.List
        aria-label={label}
        className="flex overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map(({ value, label: text, count }) => (
          <RadixTabs.Trigger
            key={value}
            value={value}
            aria-label={typeof count === 'number' ? `${text}, ${count}` : undefined}
            className={cn(
              'group relative inline-flex min-h-12 shrink-0 items-center gap-2 px-1 me-6 text-small font-medium whitespace-nowrap text-muted',
              'hover:text-fg data-[state=active]:font-semibold data-[state=active]:text-fg',
              // Inset ring: the scroll container would clip an outer outline.
              'focus-visible:outline-offset-[-2px]',
              'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-ink',
              MOTION,
            )}
          >
            {text}
            {typeof count === 'number' && (
              <span aria-hidden="true" className="min-w-5 rounded-full bg-tint px-1.5 text-center text-caption font-medium text-fg tabular-nums group-data-[state=active]:bg-lime group-data-[state=active]:text-on-bright">
                {count}
              </span>
            )}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map(({ value }) => (
        <RadixTabs.Content key={value} value={value} className="pt-5">
          {children?.(value)}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  )
}
