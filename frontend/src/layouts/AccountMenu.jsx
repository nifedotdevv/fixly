import { Link } from 'react-router'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { ChevronsUpDown } from 'lucide-react'
import { Avatar } from '../components/ui/index.js'
import { ThemeRadioItems } from '../components/theme/ThemeMenu.jsx'
import { ROLE_LABEL } from './nav.js'

const itemClass =
  'flex min-h-10 cursor-pointer items-center rounded-sm px-3 text-small font-medium text-fg outline-none data-[highlighted]:bg-tint'

// variant "bar": avatar-only trigger (top bar). "sidebar": avatar, name and role, opens upward.
export default function AccountMenu({ me, signOut, variant = 'bar' }) {
  const name = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim()
  const sidebar = variant === 'sidebar'
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Account menu"
        className={
          sidebar
            ? 'flex min-h-11 w-full items-center gap-3 rounded-[10px] px-2 py-2 text-left transition-colors duration-(--duration-fast) ease-out hover:bg-tint'
            : 'inline-flex size-11 items-center justify-center rounded-full'
        }
      >
        <Avatar src={me.avatar?.url} role={me.role} name={name} size={32} decorative={sidebar} />
        {sidebar && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-small font-medium text-fg">{name || me.email}</span>
              <span className="block truncate text-caption text-muted">{ROLE_LABEL[me.role] ?? ''}</span>
            </span>
            <ChevronsUpDown size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-muted" />
          </>
        )}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          side={sidebar ? 'top' : 'bottom'}
          align={sidebar ? 'start' : 'end'}
          sideOffset={8}
          className="z-40 min-w-52 rounded-md border border-border bg-surface p-1.5 shadow-overlay"
        >
          <Menu.Label className="truncate px-3 py-2 text-caption text-muted">{name || me.email}</Menu.Label>
          <Menu.Item asChild>
            <Link to="/account" className={itemClass}>Account</Link>
          </Menu.Item>
          <Menu.Separator className="my-1.5 h-px bg-border" />
          <Menu.Label className="px-3 py-2 text-caption text-muted">Theme</Menu.Label>
          <ThemeRadioItems />
          <Menu.Separator className="my-1.5 h-px bg-border" />
          <Menu.Item onSelect={signOut} className={itemClass}>Sign out</Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
