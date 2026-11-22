import { useState } from 'react'
import { X } from 'lucide-react'
import { CONTROL, MOTION, cn } from './cn.js'

const normalize = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase()

// Controlled: `value` is an array of strings, `onChange(nextArray)`.
export default function ChipsInput({ value = [], onChange, max, maxLength, className, ...props }) {
  const [draft, setDraft] = useState('')
  const full = max != null && value.length >= max

  function add(raw) {
    const chip = normalize(raw)
    if (!chip || full || (maxLength && chip.length > maxLength) || value.includes(chip)) {
      setDraft('')
      return
    }
    onChange?.([...value, chip])
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text"
        value={draft}
        disabled={full}
        maxLength={maxLength}
        autoComplete="off"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(draft)
          }
        }}
        className={cn(CONTROL, className)}
        {...props}
      />
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((chip) => (
            <li key={chip} className="inline-flex items-center gap-1 rounded-sm bg-accent-soft text-fg pl-3 text-caption">
              {chip}
              <button
                type="button"
                aria-label={`Remove ${chip}`}
                onClick={() => onChange?.(value.filter((c) => c !== chip))}
                className={cn('size-9 inline-flex items-center justify-center rounded-sm text-fg-2 hover:text-error', MOTION)}
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
