import { useState } from 'react'
import { CONTROL, cn } from './cn.js'
import { formatMoney } from '../../lib/money.js'


function toKobo(text) {
  const cleaned = text.replace(/[,\s]/g, '')
  if (!/^\d+$/.test(cleaned)) return null
  const kobo = Number(cleaned) * 100
  return Number.isSafeInteger(kobo) ? kobo : null
}

// `value` (kobo) seeds the field; after that the typed text is the source of truth.
export default function MoneyInput({ value = null, onChange, className, ...props }) {
  const [text, setText] = useState(value == null ? '' : String(value / 100))
  const kobo = toKobo(text)
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <span aria-hidden="true" className="absolute inset-y-0 left-3 flex items-center text-muted pointer-events-none">₦</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(e) => { setText(e.target.value); onChange?.(toKobo(e.target.value)) }}
          className={cn(CONTROL, 'pl-8 tabular', className)}
          {...props}
        />
      </div>
      <p aria-live="polite" className="tabular text-caption text-muted min-h-[1.25em]">
        {kobo === null ? '' : formatMoney({ amount: kobo })}
      </p>
    </div>
  )
}
