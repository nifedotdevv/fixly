import { deadlineFor, deadlineLabel } from '../../../lib/requestStatus.js'
import { formatDateTime, formatRelative } from '../../../lib/time.js'

// Stage copy per status and role, following the §4 status matrix.
const STAGES = {
  pending: {
    homeowner: ['Waiting for the artisan to reply', 'The artisan can accept with an inspection fee or decline. You can add a note or cancel the request.'],
    artisan: ['Your turn: reply to this request', 'Read the request, address and notes. Accept with an inspection fee, or decline with a reason.'],
  },
  inspection_confirmed: {
    homeowner: ['Inspection booked', 'The artisan visits the address in the booked window and marks the inspection done once it has ended.'],
    artisan: ['Next: inspect the job', 'Visit the address in the booked window. You can mark the inspection done once the window has ended.'],
  },
  inspection_completed: {
    homeowner: ['Waiting for the artisan to send a quote', 'The artisan has inspected and is preparing a quote.'],
    artisan: ['Your turn: send a quote', 'Describe the repair, set the total and the repair window, and choose when the quote expires.'],
  },
  quote_submitted: {
    homeowner: ['Your turn: review the quote', 'Approve the quote to book the repair, or decline it. It lapses if it is not approved before it expires.'],
    artisan: ['Waiting for the homeowner to approve your quote', 'The quote lapses if it is not approved before it expires.'],
  },
  repair_confirmed: {
    homeowner: ['Repair booked', 'The artisan starts the repair when the scheduled window opens.'],
    artisan: ['Next: start the repair', 'You can start the repair once the repair window opens.'],
  },
  repair_in_progress: {
    homeowner: ['Repair under way', 'You confirm the repair once the artisan reports it finished.'],
    artisan: ['Your turn: finish the repair', 'Report the repair finished when the work is done. The homeowner is then asked to confirm.'],
  },
  awaiting_homeowner_confirmation: {
    homeowner: ['Your turn: check the repair', 'Confirm the repair is finished, or report a problem if something is wrong.'],
    artisan: ['Waiting for the homeowner to confirm the repair', 'The homeowner confirms the repair is finished or reports a problem.'],
  },
}

const stageFor = (status, role) => STAGES[status]?.[role === 'artisan' ? 'artisan' : 'homeowner'] ?? null

export default function WaitingPanel({ view, role }) {
  const stage = stageFor(view.status, role)
  const deadline = deadlineFor(view)
  if (!stage) return null
  const [title, text] = stage
  return (
    <section data-panel="waiting" aria-labelledby="panel-waiting" className="flex flex-col gap-2">
      <h2 id="panel-waiting">{title}</h2>
      <p className="max-w-[60ch] text-fg-2">{text}</p>
      {deadline && (
        <p className="tabular text-caption text-warning">
          {deadlineLabel(view.status)} {formatDateTime(deadline)}, {formatRelative(deadline)}
        </p>
      )}
    </section>
  )
}
