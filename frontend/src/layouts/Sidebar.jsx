import { NavLink } from 'react-router'
import { LinkButton } from '../components/ui/index.js'
import AccountMenu from './AccountMenu.jsx'
import Wordmark from './Wordmark.jsx'
import { ACTION, NAV } from './nav.js'

// After Calendly's app rail: white, hairline edge, an outlined pill for the main action and
// rounded nav items. The active item is a lime-soft fill with a semibold label and heavier icon.
const linkClass = ({ isActive }) =>
  `flex h-10 items-center gap-3 rounded-[10px] px-3 text-small transition-colors duration-(--duration-fast) ease-out ${
    isActive ? 'bg-lime-soft font-semibold text-fg' : 'font-medium text-fg-2 hover:bg-tint hover:text-fg'
  }`

export default function Sidebar({ me, signOut }) {
  const items = NAV[me.role] ?? []
  const action = ACTION[me.role]
  const ActionIcon = action?.icon
  return (
    <aside className="sticky top-0 hidden h-dvh w-62 shrink-0 flex-col self-start border-r border-border bg-surface px-3 pt-5 pb-3 lg:flex">
      <Wordmark to="/dashboard" className="self-start rounded-sm px-3 py-1" />
      {action && (
        <LinkButton to={action.to} variant="secondary" className="mt-6 h-10! w-full rounded-full! border-fg">
          {ActionIcon && <ActionIcon size={18} strokeWidth={2} aria-hidden="true" />}
          {action.label}
        </LinkButton>
      )}
      <nav aria-label="Main" data-testid="nav-sidebar" className="mt-6 flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={linkClass}>
            {({ isActive }) => (
              <>
                <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto border-t border-border pt-3">
        <AccountMenu me={me} signOut={signOut} variant="sidebar" />
      </div>
    </aside>
  )
}
