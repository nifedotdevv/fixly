import { SplitTape } from '../../../components/tape/index.js'
import { formatMoney } from '../../../lib/money.js'
import { formatDateTime } from '../../../lib/time.js'
import { windowText, windowZone } from './format.js'

export default function QuotePanel({ quote }) {
  const { currency } = quote.total
  return (
    <section data-panel="quote" aria-labelledby="panel-quote" className="flex flex-col gap-3">
      <h2 id="panel-quote">Quote</h2>
      <p className="max-w-[60ch] break-words whitespace-pre-line">{quote.scope}</p>
      <p>
        <span className="text-fg-2">Total </span>
        <span className="tabular text-h3 font-medium">{formatMoney(quote.total)}</span>
      </p>
      <SplitTape
        total={quote.total.amount}
        depositAmount={quote.depositAmount}
        balanceAmount={quote.balanceAmount}
        currency={currency}
      />
      <dl className="flex flex-col gap-1 text-caption text-fg-2">
        <div className="flex flex-wrap gap-x-2">
          <dt>Quote valid until</dt>
          <dd className="tabular text-fg">{formatDateTime(quote.expiresAt)}</dd>
        </div>
        {quote.window && (
          <div className="flex flex-wrap gap-x-2">
            <dt>Repair window</dt>
            <dd className="tabular text-fg">{windowText(quote.window)} ({windowZone(quote.window)})</dd>
          </div>
        )}
      </dl>
    </section>
  )
}
