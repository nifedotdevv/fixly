import { Outlet } from 'react-router'
import { useAuth } from '../auth/useAuth.js'
import AccountMenu from './AccountMenu.jsx'
import BottomTabs from './BottomTabs.jsx'
import RouteFocus from './RouteFocus.jsx'
import Sidebar from './Sidebar.jsx'
import SkipLink from './SkipLink.jsx'
import VerifyBanner from './VerifyBanner.jsx'
import Wordmark from './Wordmark.jsx'
import { useScrolled } from './useScrolled.js'

export default function AppShell({ maxWidth }) {
  const scrolled = useScrolled()
  const { me, signOut } = useAuth()
  return (
    <div className="min-h-dvh bg-bg text-fg lg:flex">
      <SkipLink />
      <RouteFocus />
      <Sidebar me={me} signOut={signOut} />
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header
          className={`sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-surface px-4 transition-shadow duration-(--duration-normal) sm:px-8 lg:hidden ${scrolled ? 'shadow-nav' : ''}`}
        >
          <Wordmark to="/dashboard" className="rounded-sm py-3" />
          <AccountMenu me={me} signOut={signOut} />
        </header>
        <div id="banner-slot">
          <VerifyBanner maxWidth={maxWidth} />
        </div>
        <main id="main" tabIndex={-1} className={`mx-auto w-full ${maxWidth} flex-1 px-4 py-6 pb-24 outline-none sm:px-8 lg:px-12 lg:py-12 lg:pb-12`}>
          <Outlet />
        </main>
      </div>
      <BottomTabs role={me.role} />
    </div>
  )
}
