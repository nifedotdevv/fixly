import { deadlineFor } from '../../../lib/requestStatus.js'
import { formatTime } from '../../../lib/time.js'

const HOMEOWNER = {
  pending: 'Waiting for the artisan to reply.',
  inspection_confirmed: 'The inspection is booked. The artisan marks it done once the window has ended.',
  inspection_completed: 'The artisan has inspected and is preparing a quote.',
  repair_confirmed: 'The repair is booked. The artisan starts it at the scheduled window.',
  repair_in_progress: 'The repair is under way. You confirm it once the artisan reports it finished.',
}
const ARTISAN = {
  quote_submitted: 'Waiting for the homeowner to respond to your quote.',
  awaiting_homeowner_confirmation: 'Waiting for the homeowner to confirm the repair is finished.',
}

const waitingCopy = (view, role) => (role === 'artisan' ? ARTISAN : HOMEOWNER)[view.status] ?? null

export default function WaitingPanel({ view, role }) {
  const text = waitingCopy(view, role)
  const deadline = deadlineFor(view)
  if (!text) return null
  return (
    <section data-panel="waiting" aria-labelledby="panel-waiting" className="flex flex-col gap-2">
      <h2 id="panel-waiting">Waiting on the other side</h2>
      <p className="max-w-[60ch] text-fg-2">{text}</p>
      {deadline && <p className="tabular text-caption text-warning">Ends {formatTime(deadline)}</p>}
    </section>
  )
}
