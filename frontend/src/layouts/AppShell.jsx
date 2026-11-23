import { Link, NavLink, Outlet } from 'react-router'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { Avatar } from '../components/ui/index.js'
import { useAuth } from '../auth/useAuth.js'
import RouteFocus from './RouteFocus.jsx'
import SkipLink from './SkipLink.jsx'
import VerifyBanner from './VerifyBanner.jsx'
import Wordmark from './Wordmark.jsx'

const NAV = {
  house_owner: [
    { to: '/requests', label: 'Requests' },
    { to: '/artisans', label: 'Find an artisan' },
  ],
  artisan: [
    { to: '/requests', label: 'Requests' },
    { to: '/workspace/profile', label: 'My profile' },
  ],
  admin: [
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/support/problems', label: 'Support' },
  ],
}

// The global accent ring has too little contrast on the ink band; use accent-fg with an ink gap.
const onInkRing =
  'focus-visible:shadow-[0_0_0_2px_var(--color-ink),0_0_0_4px_var(--color-accent-fg)]'

const navLink = ({ isActive }) =>
  `inline-flex min-h-11 items-center rounded-sm px-2 hover:underline underline-offset-4 ${onInkRing} ${isActive ? 'font-medium underline' : 'text-accent-fg/80'}`

const itemClass =
  'flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-fg outline-none data-[highlighted]:bg-surface-inset'

function AccountMenu({ me, signOut }) {
  const name = `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim()
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Account menu"
        className={`inline-flex size-11 items-center justify-center rounded-full ${onInkRing}`}
      >
        <Avatar src={me.avatar?.url} role={me.role} name={name} size={32} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          className="z-40 min-w-48 rounded-md bg-surface p-1 shadow-overlay"
        >
          <Menu.Label className="truncate px-3 py-2 text-caption text-muted">{name || me.email}</Menu.Label>
          <Menu.Item asChild>
            <Link to="/account" className={itemClass}>Account</Link>
          </Menu.Item>
          <Menu.Item onSelect={signOut} className={itemClass}>Sign out</Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

export default function AppShell({ maxWidth }) {
  const { me, signOut } = useAuth()
  const items = NAV[me.role] ?? []
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <SkipLink />
      <RouteFocus />
      <header className="bg-ink text-accent-fg">
        <div className={`mx-auto flex w-full ${maxWidth} items-center justify-between gap-4 px-4 sm:px-8`}>
          <div className="flex flex-wrap items-center gap-x-6">
            <Wordmark to="/dashboard" className={`rounded-sm py-3 ${onInkRing}`} />
            <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} className={navLink}>{i.label}</NavLink>
              ))}
            </nav>
          </div>
          <AccountMenu me={me} signOut={signOut} />
        </div>
      </header>
      <div id="banner-slot">
        <VerifyBanner maxWidth={maxWidth} />
      </div>
      <main id="main" tabIndex={-1} className={`mx-auto w-full ${maxWidth} flex-1 px-4 outline-none sm:px-8`}>
        <Outlet />
      </main>
    </div>
  )
}
