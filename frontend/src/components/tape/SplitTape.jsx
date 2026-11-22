import { formatMoney } from '../../lib/money.js'
import './tape.css'

export default function SplitTape({ total, depositAmount, balanceAmount, currency = 'NGN' }) {
  const depositPct = Math.round((depositAmount / total) * 100)
  const balancePct = Math.round((balanceAmount / total) * 100)
  const depositText = `Deposit ${formatMoney({ amount: depositAmount, currency })} (${depositPct}%)`
  const balanceText = `Balance ${formatMoney({ amount: balanceAmount, currency })} (${balancePct}%)`
  const depositWidth = `${(depositAmount / total) * 100}%`
  const balanceWidth = `${(balanceAmount / total) * 100}%`

  return (
    <div role="img" aria-label={`${depositText}, ${balanceText}. Total ${formatMoney({ amount: total, currency })}.`}>
      <div className="relative flex h-7 w-full overflow-hidden rounded-sm border border-border bg-surface-inset">
        <div data-testid="split-deposit" className="h-5 shrink-0 border-r-2 border-surface bg-ink" style={{ width: depositWidth }} />
        <div data-testid="split-balance" className="h-5 shrink-0 bg-border-strong" style={{ width: balanceWidth }} />
        <div className="tape-minor-ticks absolute inset-x-0 bottom-0 h-2" />
        <span className="absolute bottom-0 left-0 h-3.5 w-0.5 bg-ink" />
        <span className="absolute bottom-0 h-3.5 w-0.5 -translate-x-1/2 bg-ink" style={{ left: depositWidth }} />
        <span className="absolute bottom-0 right-0 h-3.5 w-0.5 bg-ink" />
      </div>
      <div className="mt-1 flex text-caption tabular-nums text-fg" aria-hidden="true">
        <span className="min-w-0 pr-2" style={{ width: depositWidth }}>{depositText}</span>
        <span className="min-w-0" style={{ width: balanceWidth }}>{balanceText}</span>
      </div>
    </div>
  )
}
