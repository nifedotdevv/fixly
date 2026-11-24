import { Lock } from 'lucide-react'
import { Button } from '../../../components/ui/index.js'
import { formatMoney } from '../../../lib/money.js'
import { deadlineFor, deadlineLabel } from '../../../lib/requestStatus.js'
import { formatDateTime } from '../../../lib/time.js'
import { useCountdown } from '../../../lib/useCountdown.js'
import { moneyIn } from './format.js'

const isHomeowner = (role) => role === 'homeowner' || role === 'house_owner'

const WHAT = {
  awaiting_inspection_payment: 'inspection fee',
  awaiting_repair_deposit: 'repair deposit',
  awaiting_final_payment: 'balance',
}

function amountDue(view) {
  const currency = view.quote?.total?.currency
  if (view.status === 'awaiting_inspection_payment') return view.inspectionFee
  if (view.status === 'awaiting_repair_deposit') return moneyIn(view.quote?.depositAmount, currency)
  return moneyIn(view.quote?.balanceAmount, currency)
}

const LOADING = { starting: 'Opening Paystack…', open: 'Paystack is open…', confirming: 'Confirming payment…' }

function PayControls({ payment, due, expired }) {
  if (payment.phase === 'pending') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="status" className="max-w-[60ch]">
          Paystack is still processing this payment. Bank transfers can take a few minutes. This page updates once it&rsquo;s confirmed.
        </p>
        <Button variant="secondary" onClick={payment.checkAgain}>Check again</Button>
      </div>
    )
  }
  const canRecheck = payment.phase === 'error' && payment.reference
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-3">
        <Button onClick={payment.pay} disabled={expired || due?.amount == null} loading={payment.busy}
          loadingLabel={LOADING[payment.phase]}>
          Pay {due?.amount != null ? formatMoney(due) : ''}
        </Button>
        {canRecheck && <Button variant="secondary" onClick={payment.checkAgain}>Check again</Button>}
      </div>
      {payment.phase === 'error' && <p role="alert" className="max-w-[60ch] text-caption text-error">{payment.message}</p>}
      <p className="flex items-center gap-1.5 text-caption text-fg-2">
        <Lock size={14} strokeWidth={1.75} aria-hidden="true" />
        Paid securely through Paystack. Fixly never sees your card or bank details.
      </p>
    </div>
  )
}

export default function PaymentWaitingPanel({ view, role, payment }) {
  const deadline = deadlineFor(view)
  const { label } = useCountdown(deadline)
  const expired = label === 'Expired'
  const due = amountDue(view)
  const homeowner = isHomeowner(role) && payment
  const what = WHAT[view.status]
  return (
    <section data-panel="payment-waiting" aria-labelledby="panel-payment" className="flex flex-col gap-3">
      <h2 id="panel-payment">{homeowner ? `Pay the ${what}` : 'Waiting for payment'}</h2>
      {!homeowner && (
        <p className="max-w-[60ch] text-fg-2">The homeowner pays the {what} through Paystack. This step completes once the payment is confirmed.</p>
      )}
      {due?.amount != null && (
        <p>
          <span className="text-fg-2">Amount due </span>
          <span className="tabular text-h3 font-medium">{formatMoney(due)}</span>
        </p>
      )}
      {deadline && (
        <p className="tabular text-warning">
          {deadlineLabel(view.status)} {formatDateTime(deadline)}, {expired ? 'expired' : `${label} left`}
        </p>
      )}
      {homeowner && <PayControls payment={payment} due={due} expired={expired} />}
    </section>
  )
}
