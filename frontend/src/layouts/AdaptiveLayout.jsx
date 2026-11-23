import { PageSkeleton } from '../auth/guards.jsx'
import { useAuth } from '../auth/useAuth.js'
import AdminLayout from './AdminLayout.jsx'
import AppLayout from './AppLayout.jsx'
import PublicLayout from './PublicLayout.jsx'

// Pages open to everyone that should sit inside the app shell once signed in.
export default function AdaptiveLayout() {
  const { status, me } = useAuth()
  if (status === 'loading') return <PageSkeleton />
  if (status === 'signed-in' && me) return me.role === 'admin' ? <AdminLayout /> : <AppLayout />
  return <PublicLayout padded />
}
