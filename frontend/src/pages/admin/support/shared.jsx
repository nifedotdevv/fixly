import { useState } from 'react'
import { NavLink } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy } from 'lucide-react'
import { Skeleton } from '../../../components/ui/index.js'
import { MOTION, cn } from '../../../components/ui/cn.js'
import { api } from '../../../lib/api.js'
import { queryKeys } from '../../../lib/queryClient.js'
import { shortId } from './format.js'

export function CopyId({ id, label }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(id))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked; the full id stays in the title.
    }
  }
  const Icon = copied ? Check : Copy
  return (
    <span className="inline-flex items-center gap-1">
      <span className="tabular" title={String(id)}>{shortId(id)}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? `Copied ${label}` : `Copy ${label}`}
        className={cn('inline-flex size-11 items-center justify-center rounded-sm text-fg-2 hover:bg-surface-inset', MOTION)}
      >
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </span>
  )
}

export function TableSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  )
}

const TAB = 'inline-flex min-h-11 items-center border-b-2 px-3 font-medium'
function Tab({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => cn(TAB, MOTION, isActive ? 'border-accent text-fg' : 'border-transparent text-fg-2 hover:text-fg')}
    >
      {children}
    </NavLink>
  )
}

function useTotal(key, path) {
  const params = { page: 1, limit: 1 }
  const { data } = useQuery({
    queryKey: key(params),
    queryFn: ({ signal }) => api(path, { query: params, signal }),
  })
  return data?.meta?.total
}

export function SupportNav() {
  const problems = useTotal(queryKeys.adminProblems, '/admin/support/requests')
  const payments = useTotal(queryKeys.adminPayments, '/admin/support/payments')
    return (
    <nav aria-label="Support queues" className="flex gap-2 border-b border-border">
      <Tab to="/admin/support/problems">{`Problems${problems === undefined ? '' : ` (${problems})`}`}</Tab>
      <Tab to="/admin/support/payments">{`Payments${payments === undefined ? '' : ` (${payments})`}`}</Tab>
    </nav>
  )
}

