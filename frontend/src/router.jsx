import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { RedirectIfSignedIn, RequireAuth, RequireRole } from './auth/guards.jsx'
import DashboardRedirect from './auth/DashboardRedirect.jsx'
import AdminLayout from './layouts/AdminLayout.jsx'
import AppLayout from './layouts/AppLayout.jsx'
import PublicLayout from './layouts/PublicLayout.jsx'
import NotFound from './pages/NotFound.jsx'
import Placeholder from './pages/Placeholder.jsx'

const Specimen = import.meta.env.DEV ? lazy(() => import('./dev/Specimen.jsx')) : null

const page = (title) => <Placeholder title={title} />
const HOUSE_OWNER = ['house_owner']
const ARTISAN = ['artisan']
const ADMIN = ['admin']
const PARTICIPANTS = ['house_owner', 'artisan']

export default function AppRoutes() {
  return (
    <Routes>
      {Specimen && (
        <Route
          path="/dev/specimen"
          element={
            <Suspense fallback={null}>
              <Specimen />
            </Suspense>
          }
        />
      )}

      <Route element={<PublicLayout />}>
        <Route index element={page('Fixly')} />
        <Route path="artisans" element={page('Find an artisan')} />
        <Route path="artisans/:profileId" element={page('Artisan profile')} />
        <Route element={<RedirectIfSignedIn />}>
          <Route path="login" element={page('Sign in')} />
          <Route path="register" element={page('Sign up')} />
        </Route>
        <Route path="reactivate" element={page('Reactivate your account')} />
        <Route path="forgot-password" element={page('Forgot your password')} />
        <Route path="reset-password" element={page('Set a new password')} />
        <Route path="verify-email" element={page('Verify your email')} />
        <Route path="confirm-email-change" element={page('Confirm your new email')} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="dashboard" element={<DashboardRedirect />} />
          <Route path="account" element={page('Account')} />
          <Route element={<RequireRole roles={HOUSE_OWNER} />}>
            <Route path="artisans/:profileId/request" element={page('Request an inspection')} />
          </Route>
          <Route element={<RequireRole roles={PARTICIPANTS} />}>
            <Route path="requests" element={page('Requests')} />
            <Route path="requests/:id" element={page('Request')} />
          </Route>
          <Route element={<RequireRole roles={ARTISAN} />}>
            <Route path="workspace/profile" element={page('My profile')} />
          </Route>
        </Route>

        <Route element={<AdminLayout />}>
          <Route element={<RequireRole roles={ADMIN} />}>
            <Route path="admin/users" element={page('Users')} />
            <Route path="admin/users/:id" element={page('User')} />
            <Route path="admin/support/problems" element={page('Reported problems')} />
            <Route path="admin/support/problems/:id" element={page('Reported problem')} />
            <Route path="admin/support/payments" element={page('Payments to reconcile')} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
