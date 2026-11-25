import { Button, ConflictNotice, Panel } from '../../../components/ui/index.js'
import { isPaymentWaiting, RESOLVED } from '../../../lib/requestStatus.js'
import ActionsPanel from './ActionsPanel.jsx'
import CompletedPanel from './CompletedPanel.jsx'
import EndedPanel from './EndedPanel.jsx'
import PaymentWaitingPanel from './PaymentWaitingPanel.jsx'
import QuotePanel from './QuotePanel.jsx'
import SupportPanel from './SupportPanel.jsx'
import WaitingPanel from './WaitingPanel.jsx'
import { usePayment } from '../usePayment.js'

function Primary({ view, role, payment }) {
  const { status } = view
  if (isPaymentWaiting(status)) return <PaymentWaitingPanel view={view} role={role} payment={payment} />
  if (status === 'problem_reported') return <SupportPanel view={view} />
  if (status === 'completed') return <CompletedPanel view={view} />
  if (RESOLVED.includes(status)) return <EndedPanel view={view} role={role} />
  return <WaitingPanel view={view} role={role} />
}

// Shown above whatever stage the booking moved to, since a payment that could not count changes nothing.
function RefundNotice({ onDismiss }) {
  return (
    <div role="status" className="mb-6 flex flex-col items-start gap-3 rounded-sm bg-info-soft p-4">
      <p className="font-medium">Your payment couldn&rsquo;t be applied to this booking</p>
      <p className="max-w-[60ch] text-fg-2">
        It arrived after the booking had moved on, for example once the time to pay ran out or the payment was already made.
        It&rsquo;s being refunded to you in full automatically, to the account you paid from.
      </p>
      <Button variant="secondary" size="compact" onClick={onDismiss}>Got it</Button>
    </div>
  )
}

export default function StagePanel({ view, role, mutation, renderActionForm }) {
  // Lives here, not in the payment panel, so its outcome survives the booking moving to another stage.
  const payment = usePayment(view.id)
  return (
    <Panel>
      {mutation.conflict && <div className="mb-6"><ConflictNotice /></div>}
      {payment.phase === 'refunding' && <RefundNotice onDismiss={payment.dismiss} />}
      {/* One bordered layer: the sections inside are separated by dividers, not containers. */}
      <div className="flex flex-col gap-6 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-6">
        <Primary view={view} role={role} payment={payment} />
        {view.quote && <QuotePanel quote={view.quote} />}
        <ActionsPanel view={view} role={role} mutation={mutation} renderActionForm={renderActionForm} />
      </div>
    </Panel>
  )
}
