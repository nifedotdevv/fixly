import { useId, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { CONTROL, MOTION, cn } from './cn.js'

const normalize = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase()

// Controlled: `value` is an array of strings, `onChange(nextArray)`.
export default function ChipsInput({ value = [], onChange, max, maxLength, className, ...props }) {
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const inputRef = useRef(null)
  const messageId = useId()
  const full = max != null && value.length >= max
  const message = problem || (full ? `You can add up to ${max}.` : '')

  function reject(text) {
    setProblem(text)
    setAnnouncement(text)
  }

  function add(raw) {
    const chip = normalize(raw)
    if (!chip) {
      setDraft('')
      return
    }
    if (full) return reject(`You can add up to ${max}.`)
    if (maxLength && chip.length > maxLength) return reject(`Keep it to ${maxLength} characters or fewer.`)
    if (value.includes(chip)) {
      setDraft('')
      return reject(`“${chip}” is already added.`)
    }
    onChange?.([...value, chip])
    setDraft('')
    setProblem('')
    setAnnouncement(`Added ${chip}.`)
  }

  function remove(chip) {
    onChange?.(value.filter((c) => c !== chip))
    setProblem('')
    setAnnouncement(`Removed ${chip}.`)
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        readOnly={full}
        aria-disabled={full || undefined}
        aria-describedby={message ? messageId : undefined}
        autoComplete="off"
        onChange={(e) => { setDraft(e.target.value); setProblem('') }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(draft)
          }
        }}
        className={cn(CONTROL, full && 'opacity-50 cursor-not-allowed', className)}
        {...props}
      />
      <p id={messageId} className="min-h-5 text-caption text-fg-2" hidden={!message}>{message}</p>
      <p role="status" className="sr-only">{announcement}</p>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((chip) => (
            <li key={chip} className="inline-flex items-center gap-1 rounded-sm bg-accent-soft text-fg pl-3 text-caption">
              {chip}
              <button
                type="button"
                aria-label={`Remove ${chip}`}
                onClick={() => remove(chip)}
                className={cn('size-11 inline-flex items-center justify-center rounded-sm text-fg-2 hover:text-error', MOTION)}
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
