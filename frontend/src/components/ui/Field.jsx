import { Children, cloneElement, useId } from 'react'
import { CircleAlert } from 'lucide-react'

export default function Field({ label, helper, error, children, className = '' }) {
  const uid = useId()
  const id = `${uid}-control`
  const helperId = helper ? `${uid}-helper` : null
  const errorId = error ? `${uid}-error` : null
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined
  const child = Children.only(children)
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={id} className="font-medium text-fg">{label}</label>
      {cloneElement(child, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {helper && <p id={helperId} className="text-caption text-muted">{helper}</p>}
      {error && (
        <p id={errorId} aria-live="polite" className="flex items-start gap-2 text-caption text-error">
          <CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
