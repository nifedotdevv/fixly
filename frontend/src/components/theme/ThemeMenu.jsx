import * as Menu from '@radix-ui/react-dropdown-menu'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../../lib/theme.js'

const THEME_OPTIONS = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

const itemClass =
  'flex min-h-10 cursor-pointer items-center gap-3 rounded-sm px-3 text-small font-medium text-fg outline-none data-[highlighted]:bg-tint'

// Radio items for System / Light / Dark. Drop into any Radix dropdown (the account menu uses it too).
export function ThemeRadioItems() {
  const { theme, setTheme } = useTheme()
  return (
    <Menu.RadioGroup value={theme} onValueChange={setTheme}>
      {THEME_OPTIONS.map(({ value, label, Icon }) => (
        <Menu.RadioItem key={value} value={value} className={itemClass} onSelect={(e) => e.preventDefault()}>
          <Icon size={16} strokeWidth={1.75} aria-hidden="true" className="text-fg-2" />
          <span className="flex-1">{label}</span>
          <Menu.ItemIndicator><Check size={16} strokeWidth={2} aria-hidden="true" /></Menu.ItemIndicator>
        </Menu.RadioItem>
      ))}
    </Menu.RadioGroup>
  )
}

// Icon button for pages without an account menu (public header, auth pages).
export default function ThemeMenu({ className = '' }) {
  const { resolved } = useTheme()
  const Icon = resolved === 'dark' ? Moon : Sun
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Theme"
        className={`inline-flex size-11 items-center justify-center rounded-md text-fg hover:bg-tint ${className}`}
      >
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={8} className="z-40 min-w-44 rounded-md border border-border bg-surface p-1.5 shadow-overlay">
          <Menu.Label className="px-3 py-2 text-caption text-muted">Theme</Menu.Label>
          <ThemeRadioItems />
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
