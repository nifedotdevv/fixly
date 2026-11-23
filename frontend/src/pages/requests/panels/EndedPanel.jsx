import { LinkButton } from '../../../components/ui/index.js'
import { statusMeta } from '../../../lib/requestStatus.js'

const SUMMARY = {
  rejected: 'The artisan declined this request.',
  response_expired: 'The artisan did not reply in time.',
  cancelled: 'This request was cancelled.',
  inspection_payment_expired: 'The inspection fee was not recorded in time.',
  quote_expired: 'The quote expired before it was approved.',
  repair_not_proceeding: 'The quote was declined, so the repair is not going ahead.',
  repair_payment_expired: 'The deposit was not recorded in time.',
  support_closed: 'Closed by Fixly support. This is not a payment or refund.',
}

// The statuses where the matrix offers the homeowner a way forward.
const FIND_ANOTHER = ['rejected', 'response_expired', 'inspection_payment_expired']

export default function EndedPanel({ view, role }) {
  const { label } = statusMeta(view.status)
  return (
    <section data-panel="ended" aria-labelledby="panel-ended" className="flex flex-col gap-3">
      <h2 id="panel-ended">{label}</h2>
      <p className="max-w-[60ch] text-fg-2">{SUMMARY[view.status]}</p>
      {view.rejectionReason && (
        <p className="max-w-[60ch] break-words">
          <span className="font-medium">Reason: </span>
          {view.rejectionReason}
        </p>
      )}
      {role !== 'artisan' && FIND_ANOTHER.includes(view.status) && (
        <div>
          <LinkButton to="/artisans" variant="secondary">Find another artisan</LinkButton>
        </div>
      )}
    </section>
  )
}
