import { useEffect } from 'react'
import { NavLink } from 'react-router'
import { NAV } from './nav.js'

const tabClass = ({ isActive }) =>
  `flex min-h-11 flex-1 flex-col items-center justify-center gap-1 text-caption ${
    isActive ? 'font-semibold text-fg' : 'font-medium text-fg-2'
  }`

export default function BottomTabs({ role }) {
  const items = NAV[role] ?? []
  // Lets the toast viewport lift itself clear of this bar, and only while the bar exists.
  useEffect(() => {
    document.documentElement.dataset.hasTabbar = ''
    return () => { delete document.documentElement.dataset.hasTabbar }
  }, [])
  return (
    <nav
      aria-label="Main"
      data-testid="nav-tabs"
      className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className={tabClass}>
          {({ isActive }) => (
            <>
              <span
                className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-(--duration-fast) ease-out ${isActive ? 'bg-lime-soft' : ''}`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} aria-hidden="true" />
              </span>
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
