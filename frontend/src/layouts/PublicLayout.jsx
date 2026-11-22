import { Link, NavLink, Outlet } from 'react-router'
import { LinkButton } from '../components/ui/index.js'
import { useAuth } from '../auth/useAuth.js'
import RouteFocus from './RouteFocus.jsx'
import SkipLink from './SkipLink.jsx'
import Wordmark from './Wordmark.jsx'

const navLink = ({ isActive }) =>
  `inline-flex min-h-11 items-center px-2 hover:underline ${isActive ? 'font-medium underline underline-offset-4' : 'text-fg-2'}`

export default function PublicLayout() {
  const { status } = useAuth()
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <SkipLink />
      <RouteFocus />
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-6 px-4 sm:px-8">
          <Wordmark className="py-3" />
          <nav aria-label="Main" className="flex flex-wrap items-center gap-1 sm:gap-3">
            <NavLink to="/artisans" className={navLink}>Find an artisan</NavLink>
            {status === 'signed-in' ? (
              <LinkButton to="/dashboard" size="compact">Open dashboard</LinkButton>
            ) : (
              <>
                <NavLink to="/login" className={navLink}>Sign in</NavLink>
                <LinkButton to="/register" size="compact">Sign up</LinkButton>
              </>
            )}
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1200px] flex-1 px-4 outline-none sm:px-8">
        <Outlet />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-4 py-6 text-caption text-fg-2 sm:px-8">
          <p>
            <span className="font-display font-black text-fg">Fixly</span> connects homeowners with artisans for inspections and repairs.
          </p>
          <nav aria-label="Footer" className="flex gap-4">
            <Link to="/artisans" className="hover:underline">Find an artisan</Link>
            <Link to="/register" className="hover:underline">Sign up</Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
