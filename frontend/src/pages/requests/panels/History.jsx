import { Panel } from '../../../components/ui/index.js'
import { formatDateTime } from '../../../lib/time.js'

const DISPOSITION = {
  resume_confirmation: 'Support returned the job to homeowner confirmation',
  close: 'Support closed the job',
}

function entries(view) {
  const list = []
  const add = (at, label, detail) => at && list.push({ at, label, detail })
  add(view.createdAt, 'Request sent')
  add(view.acceptedAt, 'Artisan accepted')
  add(view.inspection?.confirmedAt, 'Inspection booked')
  add(view.inspection?.completedAt, 'Inspection done')
  add(view.quote?.submittedAt, 'Quote sent')
  add(view.quote?.approvedAt, 'Quote approved')
  add(view.quote?.declinedAt, 'Quote declined')
  add(view.workStartedAt, 'Repair started')
  add(view.artisanCompletedAt, 'Artisan reported repair finished')
  add(view.homeownerConfirmedAt, 'Homeowner confirmed repair finished')
  add(view.completedAt, 'Completed')
  add(view.cancelledAt, 'Cancelled')
  add(view.rejectedAt, 'Declined by artisan')
  add(view.expiredAt, 'Expired')
  add(view.problem?.reportedAt, 'Problem reported')
  for (const r of view.supportResolutions ?? []) add(r.resolvedAt, DISPOSITION[r.disposition] ?? 'Support resolved the problem')
  for (const n of view.notes ?? []) add(n.createdAt, 'Homeowner note', n.text)
  return list.sort((a, b) => new Date(a.at) - new Date(b.at))
}

export default function History({ view }) {
  const list = entries(view)
  return (
    <Panel title="History" flush>
      <ol>
        {list.map((e, i) => (
          <li key={`${e.label}-${i}`} className="flex flex-col gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:flex-row sm:gap-4 lg:px-6">
            <time dateTime={new Date(e.at).toISOString()} className="tabular shrink-0 text-caption text-fg-2 sm:w-56">
              {formatDateTime(e.at)}
            </time>
            <div className="min-w-0">
              <p className="font-medium">{e.label}</p>
              {e.detail && <p className="max-w-[60ch] break-words whitespace-pre-line text-fg-2">{e.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
