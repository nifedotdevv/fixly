import { Avatar } from '../../../components/ui/index.js'
import { formatMoney } from '../../../lib/money.js'
import { formatDateTime } from '../../../lib/time.js'
import { moneyIn, personOf, windowText, windowZone } from './format.js'

const PURPOSE = { inspection: 'Inspection fee', repair_deposit: 'Repair deposit', repair_balance: 'Repair balance' }

function Person({ view, side }) {
  const { name, avatar } = personOf(view, side)
  return (
    <li className="flex items-center gap-3">
      <Avatar src={avatar} role={side === 'artisan' ? 'artisan' : 'house_owner'} name={name} size={40} decorative />
      <div className="min-w-0">
        <p className="break-words font-medium">{name}</p>
        <p className="text-caption text-fg-2">{side === 'artisan' ? 'Artisan' : 'Homeowner'}</p>
      </div>
    </li>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption text-fg-2">{label}</dt>
      <dd className="tabular break-words">{children}</dd>
    </div>
  )
}

function Window({ label, window }) {
  return (
    <Row label={label}>
      {windowText(window)}
      <span className="block text-caption text-fg-2">{windowZone(window)}</span>
    </Row>
  )
}

export default function FactsRail({ view }) {
  const inspection = view.inspection?.window ?? view.inspectionWindow
  const repair = view.repair?.window ?? view.quote?.window
  const currency = view.quote?.total?.currency
  return (
    <aside aria-label="Request facts" className="flex flex-col gap-6">
      <ul className="flex flex-col gap-3">
        <Person view={view} side="homeowner" />
        <Person view={view} side="artisan" />
      </ul>
      <dl className="flex flex-col gap-4">
        <Row label="Service address"><span className="whitespace-pre-line">{view.serviceAddress}</span></Row>
        {inspection && <Window label="Inspection window" window={inspection} />}
        {repair && <Window label="Repair window" window={repair} />}
        {view.inspectionFee && <Row label="Inspection fee">{formatMoney(view.inspectionFee)}</Row>}
        {view.quote && (
          <>
            <Row label="Quote total">{formatMoney(view.quote.total)}</Row>
            <Row label="Deposit">{formatMoney(moneyIn(view.quote.depositAmount, currency))}</Row>
            <Row label="Balance">{formatMoney(moneyIn(view.quote.balanceAmount, currency))}</Row>
          </>
        )}
      </dl>
      {view.payments?.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-h3">Payments received</h2>
          <ul className="flex flex-col border-t border-border">
            {view.payments.map((p, i) => (
              <li key={`${p.purpose}-${i}`} className="flex flex-col gap-1 border-b border-border py-2">
                <span className="flex justify-between gap-3">
                  <span>{PURPOSE[p.purpose] ?? p.purpose}</span>
                  <span className="tabular font-medium">{formatMoney(p)}</span>
                </span>
                <span className="tabular text-caption text-fg-2">{formatDateTime(p.recordedAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-caption text-fg-2">
        Fixly doesn&rsquo;t offer messaging. The scheduled window and address are the agreement.
      </p>
    </aside>
  )
}
