import { Banknote, Inbox, Plus, Search, TriangleAlert, UserRound, Users } from 'lucide-react'

export const NAV = {
  house_owner: [
    { to: '/requests', label: 'Requests', icon: Inbox },
    { to: '/artisans', label: 'Find an artisan', icon: Search },
  ],
  artisan: [
    { to: '/requests', label: 'Requests', icon: Inbox },
    { to: '/workspace/profile', label: 'My profile', icon: UserRound },
  ],
  admin: [
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/support/problems', label: 'Problems', icon: TriangleAlert },
    { to: '/admin/support/payments', label: 'Payments', icon: Banknote },
  ],
}

// Sidebar only. Admin has no main action.
export const ACTION = {
  house_owner: { to: '/artisans', label: 'New request', icon: Plus },
  artisan: { to: '/workspace/profile', label: 'Edit profile' },
}

export const ROLE_LABEL = { house_owner: 'Homeowner', artisan: 'Artisan', admin: 'Admin' }
