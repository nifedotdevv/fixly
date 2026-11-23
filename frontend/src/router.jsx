import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { RedirectIfSignedIn, RequireAuth, RequireRole } from './auth/guards.jsx'
import DashboardRedirect from './auth/DashboardRedirect.jsx'
import AdminLayout from './layouts/AdminLayout.jsx'
import AppLayout from './layouts/AppLayout.jsx'
import PublicLayout from './layouts/PublicLayout.jsx'
import Login from './pages/auth/Login.jsx'
import Reactivate from './pages/auth/Reactivate.jsx'
import Register from './pages/auth/Register.jsx'
import ForgotPassword from './pages/auth/ForgotPassword.jsx'
import ResetPassword from './pages/auth/ResetPassword.jsx'
import VerifyEmail from './pages/auth/VerifyEmail.jsx'
import ConfirmEmailChange from './pages/auth/ConfirmEmailChange.jsx'
import Account from './pages/account/Account.jsx'
import Directory from './pages/artisans/Directory.jsx'
import ArtisanDetail from './pages/artisans/Detail.jsx'
import WorkspaceProfile from './pages/workspace/Profile.jsx'
import NewRequest from './pages/requests/NewRequest.jsx'
import RequestDetail from './pages/requests/RequestDetail.jsx'
import RequestList from './pages/requests/RequestList.jsx'
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
        <Route path="artisans" element={<Directory />} />
        <Route path="artisans/:profileId" element={<ArtisanDetail />} />
        <Route element={<RedirectIfSignedIn />}>
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
        </Route>
        <Route path="reactivate" element={<Reactivate />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="confirm-email-change" element={<ConfirmEmailChange />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="dashboard" element={<DashboardRedirect />} />
          <Route path="account" element={<Account />} />
          <Route element={<RequireRole roles={HOUSE_OWNER} />}>
            <Route path="artisans/:profileId/request" element={<NewRequest />} />
          </Route>
          <Route element={<RequireRole roles={PARTICIPANTS} />}>
            <Route path="requests" element={<RequestList />} />
            <Route path="requests/:id" element={<RequestDetail />} />
          </Route>
          <Route element={<RequireRole roles={ARTISAN} />}>
            <Route path="workspace/profile" element={<WorkspaceProfile />} />
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
