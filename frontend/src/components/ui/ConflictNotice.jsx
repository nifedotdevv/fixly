import { RefreshCw } from 'lucide-react'

export default function ConflictNotice() {
  return (
    <p role="status" className="flex items-start gap-2 rounded-sm bg-info-soft p-3 text-info">
      <RefreshCw size={20} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0" />
      This job changed while you were looking. Here&rsquo;s the latest.
    </p>
  )
}
