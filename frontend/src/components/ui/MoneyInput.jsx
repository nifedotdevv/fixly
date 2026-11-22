import { useId, useState } from 'react'
import { CONTROL, cn } from './cn.js'
import { formatMoney } from '../../lib/money.js'

// Currency symbol, thousands separators and whitespace are never meaningful; drop them on input and paste.
const strip = (text) => text.replace(/[₦,\s]/g, '')

function toKobo(cleaned) {
  if (!/^\d+$/.test(cleaned)) return null
  const kobo = Number(cleaned) * 100
  return Number.isSafeInteger(kobo) ? kobo : null
}

// `value` (kobo) seeds the field; after that the typed text is the source of truth.
export default function MoneyInput({ value = null, onChange, onBlur, className, ...props }) {
  const [text, setText] = useState(value == null ? '' : String(value / 100))
  const [announced, setAnnounced] = useState('')
  const errorId = useId()
  const kobo = toKobo(text)
  const hint = kobo === null ? '' : formatMoney({ amount: kobo })
  const invalid = text !== '' && kobo === null
  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <span aria-hidden="true" className="absolute inset-y-0 left-3 flex items-center text-muted pointer-events-none">₦</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          onChange={(e) => {
            const next = strip(e.target.value)
            setText(next)
            setAnnounced('')
            onChange?.(toKobo(next))
          }}
          onBlur={(e) => { setAnnounced(hint); onBlur?.(e) }}
          className={cn(CONTROL, 'pl-8 tabular', className)}
          {...props}
        />
      </div>
      <p id={errorId} aria-live="polite" className="text-caption text-error empty:hidden">
        {invalid ? 'Enter a whole naira amount' : ''}
      </p>
      <p aria-hidden="true" className="tabular text-caption text-muted min-h-[1.25em]">{hint}</p>
      <p role="status" className="sr-only">{announced}</p>
    </div>
  )
}
