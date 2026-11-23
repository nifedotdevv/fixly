import { formatMoney } from '../../lib/money.js'
import './tape.css'

export default function SplitTape({ total, depositAmount, balanceAmount, currency = 'NGN' }) {
  if (!(total > 0)) return null
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
      {/* Stacked below sm so long amounts never overflow; proportional (and wrapping) from sm up. */}
      <div className="mt-1 flex flex-col gap-1 text-caption tabular-nums text-fg sm:flex-row sm:gap-0" aria-hidden="true">
        <span className="min-w-0 sm:w-(--w) sm:pr-2" style={{ '--w': depositWidth }}>{depositText}</span>
        <span className="min-w-0 sm:w-(--w)" style={{ '--w': balanceWidth }}>{balanceText}</span>
      </div>
    </div>
  )
}
