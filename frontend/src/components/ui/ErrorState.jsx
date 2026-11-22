import { CircleAlert } from 'lucide-react'
import Button from './Button.jsx'

export default function ErrorState({ title, message, onRetry, retrying = false }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4 py-8">
      <div className="flex items-start gap-3">
        <CircleAlert size={20} strokeWidth={1.75} aria-hidden="true" className="mt-1 shrink-0 text-error" />
        <div>
          <h3>{title}</h3>
          <p className="text-fg-2 max-w-[60ch]">{message}</p>
        </div>
      </div>
      <Button variant="secondary" onClick={onRetry} loading={retrying} loadingLabel="Retrying…">Retry</Button>
    </div>
  )
}
