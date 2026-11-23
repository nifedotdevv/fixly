import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router'
import { api, ApiError } from '../lib/api.js'
import { queryKeys } from '../lib/queryClient.js'
import { Skeleton } from '../components/ui/index.js'
import { useAuth } from './useAuth.js'

function Waiting() {
  return (
    <div role="status" aria-label="Loading…" className="py-8">
      <Skeleton className="h-9 w-64" />
    </div>
  )
}

function ArtisanRedirect() {
  const profile = useQuery({
    queryKey: queryKeys.myProfile(),
    queryFn: () => api('/artisan/profile/me'),
  })
  if (profile.isPending) return <Waiting />
  if (profile.error instanceof ApiError && profile.error.status === 404) {
    return <Navigate to="/workspace/profile" replace />
  }
  return <Navigate to="/requests" replace />
}

export default function DashboardRedirect() {
  const { me } = useAuth()
  if (me.role === 'admin') return <Navigate to="/admin/users" replace />
  if (me.role === 'artisan') return <ArtisanRedirect />
  return <Navigate to="/requests" replace />
}
