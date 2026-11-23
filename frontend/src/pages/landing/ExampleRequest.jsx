import { useState } from 'react'
import { SplitTape, Tape } from '../../components/tape/index.js'
import { StatusBadge } from '../../components/ui/index.js'
import { formatMoney } from '../../lib/money.js'
import { statusMeta } from '../../lib/requestStatus.js'
import { formatDateTime } from '../../lib/time.js'

const HOUR = 3600 * 1000
const TOTAL = 8500000
const DEPOSIT = 5950000

// Sample data, rendered with the same components the real request page uses.
export default function ExampleRequest() {
  const [{ deadline, inspected }] = useState(() => {
    const now = Date.now()
    return {
      deadline: new Date(now + 26 * HOUR).toISOString(),
      inspected: new Date(now - 20 * HOUR).toISOString(),
    }
  })
  const { label, tone } = statusMeta('quote_submitted')
  const facts = [
    ['Job', 'Leaking kitchen sink pipe'],
    ['Artisan', 'Plumber, Surulere, Lagos'],
    ['Inspected', formatDateTime(inspected)],
    ['Quote total', formatMoney({ amount: TOTAL })],
  ]

  return (
    <section aria-labelledby="example-title" className="rounded-md border border-border bg-surface p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="example-title" className="text-h3">Example request</h2>
        <StatusBadge tone={tone}>{label}</StatusBadge>
      </div>
      <p className="mt-1 text-caption text-muted">Sample data, not a real job.</p>

      <div className="mt-6">
        <Tape status="quote_submitted" view={{ status: 'quote_submitted' }} deadline={deadline} />
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <p className="mb-2 text-caption text-fg-2">How the quote splits</p>
        <SplitTape total={TOTAL} depositAmount={DEPOSIT} balanceAmount={TOTAL - DEPOSIT} />
      </div>

      <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-t border-border pt-4 text-caption">
        {facts.map(([term, value]) => (
          <div key={term} className="col-span-2 grid grid-cols-subgrid">
            <dt className="text-muted">{term}</dt>
            <dd className="text-right font-display font-medium tabular-nums text-fg">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
