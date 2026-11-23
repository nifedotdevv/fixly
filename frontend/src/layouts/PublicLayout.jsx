import { Children } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import * as Menu from '@radix-ui/react-dropdown-menu'
import { Menu as MenuIcon } from 'lucide-react'
import { LinkButton } from '../components/ui/index.js'
import ThemeMenu from '../components/theme/ThemeMenu.jsx'
import { useAuth } from '../auth/useAuth.js'
import RouteFocus from './RouteFocus.jsx'
import SkipLink from './SkipLink.jsx'
import Wordmark, { LogoMark } from './Wordmark.jsx'
import { useScrolled } from './useScrolled.js'

const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/reactivate']

const navLink = ({ isActive }) =>
  `inline-flex min-h-11 items-center rounded-md px-2 text-small font-medium text-fg transition-colors duration-(--duration-fast) ease-out hover:bg-tint ${
    isActive ? 'bg-tint' : ''
  }`

const itemClass =
  'flex min-h-11 cursor-pointer items-center rounded-sm px-3 text-small font-medium text-fg outline-none data-[highlighted]:bg-tint'

const footerLink =
  'focus-on-band inline-flex min-h-10 items-center rounded-sm text-small text-on-band/70 transition-colors duration-(--duration-fast) ease-out hover:text-on-band'

function FooterColumn({ title, children }) {
  return (
    <div>
      <h2 className="text-lead font-medium text-on-band">{title}</h2>
      <ul className="mt-3 flex flex-col">
        {Children.map(children, (child) => child && <li>{child}</li>)}
      </ul>
    </div>
  )
}

function MobileMenu({ signedOut }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Menu"
        className="inline-flex size-11 items-center justify-center rounded-md hover:bg-tint sm:hidden"
      >
        <MenuIcon size={24} strokeWidth={1.75} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={8} className="z-40 min-w-48 rounded-md border border-border bg-surface p-1 shadow-overlay">
          <Menu.Item asChild>
            <Link to="/artisans" className={itemClass}>Find an artisan</Link>
          </Menu.Item>
          {signedOut && (
            <>
              <Menu.Item asChild>
                <Link to="/login" className={itemClass}>Sign in</Link>
              </Menu.Item>
              <Menu.Item asChild>
                <Link to="/register" className={itemClass}>Sign up</Link>
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

export default function PublicLayout({ padded = false }) {
  const { status } = useAuth()
  const scrolled = useScrolled()
  const { pathname } = useLocation()
  // Auth pages are a full-page split: edge to edge, with no top bar and no footer.
  const auth = AUTH_PATHS.includes(pathname)
  const landing = pathname === '/' || auth
  const signedOut = status === 'signed-out'
  const showAuthLinks = signedOut && !auth
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <SkipLink />
      <RouteFocus />
      {!auth && <header
        className={`sticky top-0 z-30 bg-bg transition-shadow duration-(--duration-normal) ${scrolled ? 'shadow-nav' : ''}`}
      >
        <div className="flex h-16 w-full items-center justify-between gap-4 px-4 sm:h-17 sm:px-8 lg:px-12">
          <div className="flex items-center gap-2 sm:gap-8">
            <Wordmark className="rounded-sm" />
            <nav aria-label="Main" className="hidden sm:block">
              <NavLink to="/artisans" className={navLink}>Find an artisan</NavLink>
            </nav>
          </div>
          {/* Nothing for auth links while the session loads, so Sign in never flashes for a signed-in user. */}
          <div className="flex items-center gap-2 sm:gap-3">
            {showAuthLinks && (
              <LinkButton to="/login" variant="secondary" className="h-12! max-sm:hidden!">
                Sign in
              </LinkButton>
            )}
            {showAuthLinks && (
              <LinkButton to="/register" className="h-10! sm:h-12!">Sign up</LinkButton>
            )}
            {status === 'signed-in' && (
              <LinkButton to="/dashboard" className="h-10! sm:h-12!">Open dashboard</LinkButton>
            )}
            <ThemeMenu />
            <MobileMenu signedOut={showAuthLinks} />
          </div>
        </div>
      </header>}
      <main
        id="main"
        tabIndex={-1}
        className={`flex-1 outline-none ${landing ? 'w-full' : `mx-auto w-full max-w-[1200px] px-4 sm:px-8 ${padded ? 'py-6 lg:py-10' : ''}`}`}
      >
        <Outlet />
      </main>
      {!auth && <footer className="bg-band text-on-band">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-8 lg:px-0 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
            <div>
              <span translate="no" className="inline-flex items-center gap-2 text-[1.375rem] font-semibold tracking-[-0.03em]">
                <LogoMark size={24} />
                Fixly
              </span>
              <p className="mt-4 max-w-[40ch] text-small text-on-band/70">Fixly connects homeowners with artisans for inspections and repairs.</p>
            </div>
            <nav aria-label="Footer" className="flex flex-col gap-8 lg:col-span-2 lg:grid lg:grid-cols-subgrid">
              <FooterColumn title="Product">
                <Link to="/artisans" className={footerLink}>Find an artisan</Link>
                {signedOut && <Link to="/register" className={footerLink}>Sign up</Link>}
                {signedOut && <Link to="/login" className={footerLink}>Sign in</Link>}
              </FooterColumn>
              {signedOut && (
                <FooterColumn title="For artisans">
                  <Link to="/register?role=artisan" className={footerLink}>Register as an artisan</Link>
                  <Link to="/login" className={footerLink}>Artisan sign in</Link>
                </FooterColumn>
              )}
            </nav>
          </div>
          <p className="mt-12 border-t border-on-band/15 pt-6 text-caption text-on-band/70">&copy; {new Date().getFullYear()} Fixly</p>
        </div>
      </footer>}
    </div>
  )
}
