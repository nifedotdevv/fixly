import { formatMoney } from '../../lib/money.js'

export default function SplitBar({ total, depositAmount, balanceAmount, currency = 'NGN' }) {
  if (!(total > 0)) return null
  const depositPct = Math.round((depositAmount / total) * 100)
  const balancePct = Math.round((balanceAmount / total) * 100)
  const depositText = `Deposit ${formatMoney({ amount: depositAmount, currency })} (${depositPct}%)`
  const balanceText = `Balance ${formatMoney({ amount: balanceAmount, currency })} (${balancePct}%)`
  const depositWidth = `${(depositAmount / total) * 100}%`
  const balanceWidth = `${(balanceAmount / total) * 100}%`

  return (
    <div role="img" aria-label={`${depositText}, ${balanceText}. Total ${formatMoney({ amount: total, currency })}.`}>
      <div className="flex h-3 w-full gap-0.5">
        <div data-testid="split-deposit" className="h-full min-w-0 shrink rounded-full bg-ink" style={{ width: depositWidth }} />
        <div data-testid="split-balance" className="h-full min-w-0 shrink rounded-full bg-border-strong" style={{ width: balanceWidth }} />
      </div>
      {/* Stacked below sm so long amounts never overflow; proportional (and wrapping) from sm up. */}
      <div className="mt-2 flex flex-col gap-1 text-caption tabular-nums text-fg sm:flex-row sm:gap-0" aria-hidden="true">
        <span className="min-w-0 sm:w-(--w) sm:pr-2" style={{ '--w': depositWidth }}>{depositText}</span>
        <span className="min-w-0 sm:w-(--w)" style={{ '--w': balanceWidth }}>{balanceText}</span>
      </div>
    </div>
  )
}
