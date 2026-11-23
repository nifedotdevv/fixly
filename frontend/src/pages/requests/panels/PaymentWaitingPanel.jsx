import { formatMoney } from '../../../lib/money.js'
import { deadlineFor } from '../../../lib/requestStatus.js'
import { formatTime } from '../../../lib/time.js'
import { useCountdown } from '../../../lib/useCountdown.js'
import { moneyIn } from './format.js'

function amountDue(view) {
  const currency = view.quote?.total?.currency
  if (view.status === 'awaiting_inspection_payment') return view.inspectionFee
  if (view.status === 'awaiting_repair_deposit') return moneyIn(view.quote?.depositAmount, currency)
  return moneyIn(view.quote?.balanceAmount, currency)
}

export default function PaymentWaitingPanel({ view }) {
  const deadline = deadlineFor(view)
  const { label } = useCountdown(deadline)
  const due = amountDue(view)
  return (
    <section data-panel="payment-waiting" aria-labelledby="panel-payment" className="flex flex-col gap-3">
      <h2 id="panel-payment">Waiting for payment</h2>
      <p className="max-w-[60ch] text-fg-2">
        Online payment isn&rsquo;t available in Fixly yet. This step completes when payment is recorded.
      </p>
      {due?.amount != null && (
        <p>
          <span className="text-fg-2">Amount due </span>
          <span className="tabular text-h3 font-medium">{formatMoney(due)}</span>
        </p>
      )}
      {deadline && (
        <p className="tabular text-warning">
          Ends {formatTime(deadline)}, {label === 'Expired' ? 'expired' : `${label} left`}
        </p>
      )}
    </section>
  )
}
