import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import { Skeleton } from '../components/ui/index.js'
import WrongRole from '../pages/WrongRole.jsx'
import { safeNext } from './roles.js'
import { useAuth } from './useAuth.js'

export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading…" className="flex flex-col gap-4 py-8">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-5 w-full max-w-xl" />
      <Skeleton className="h-5 w-full max-w-md" />
    </div>
  )
}

export function RequireAuth() {
  const { status, endReasonFor } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageSkeleton />
  if (status === 'signed-out') {
    const path = location.pathname + location.search
    const reason = endReasonFor?.(location.key)
    // The session just ended here: sign out goes home, expiry says so on the login page.
    if (reason === 'signed-out') return <Navigate to="/" replace />
    // The flow that ended the session navigates itself (to /login with a notice).
    if (reason === 'ended') return null
    const next = encodeURIComponent(path)
    return <Navigate to={`/login?next=${next}${reason === 'expired' ? '&expired=1' : ''}`} replace />
  }
  return <Outlet />
}

export function RequireRole({ roles }) {
  const { me } = useAuth()
  if (!me || !roles.includes(me.role)) return <WrongRole roles={roles} />
  return <Outlet />
}

export function RedirectIfSignedIn() {
  const { status } = useAuth()
  const [params] = useSearchParams()
  if (status === 'loading') return <PageSkeleton />
  if (status === 'signed-in') return <Navigate to={safeNext(params.get('next')) ?? '/dashboard'} replace />
  return <Outlet />
}
