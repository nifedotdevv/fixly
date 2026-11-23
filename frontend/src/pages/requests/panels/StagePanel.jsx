import { ConflictNotice, Panel } from '../../../components/ui/index.js'
import { isPaymentWaiting, RESOLVED } from '../../../lib/requestStatus.js'
import ActionsPanel from './ActionsPanel.jsx'
import CompletedPanel from './CompletedPanel.jsx'
import EndedPanel from './EndedPanel.jsx'
import PaymentWaitingPanel from './PaymentWaitingPanel.jsx'
import QuotePanel from './QuotePanel.jsx'
import SupportPanel from './SupportPanel.jsx'
import WaitingPanel from './WaitingPanel.jsx'

function Primary({ view, role }) {
  const { status } = view
  if (isPaymentWaiting(status)) return <PaymentWaitingPanel view={view} />
  if (status === 'problem_reported') return <SupportPanel view={view} />
  if (status === 'completed') return <CompletedPanel view={view} />
  if (RESOLVED.includes(status)) return <EndedPanel view={view} role={role} />
  return <WaitingPanel view={view} role={role} />
}

export default function StagePanel({ view, role, mutation, renderActionForm }) {
  return (
    <Panel>
      {mutation.conflict && <div className="mb-6"><ConflictNotice /></div>}
      {/* One bordered layer: the sections inside are separated by dividers, not containers. */}
      <div className="flex flex-col gap-6 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-6">
        <Primary view={view} role={role} />
        {view.quote && <QuotePanel quote={view.quote} />}
        <ActionsPanel view={view} role={role} mutation={mutation} renderActionForm={renderActionForm} />
      </div>
    </Panel>
  )
}
