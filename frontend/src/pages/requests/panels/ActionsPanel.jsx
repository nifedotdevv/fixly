import { useReducer } from 'react'
import { Button, ConfirmDialog } from '../../../components/ui/index.js'
import { actionsFor } from '../../../lib/requestStatus.js'
import { formatDateTime } from '../../../lib/time.js'
import { useCountdown } from '../../../lib/useCountdown.js'

const CONFIRM_TEXT = {
  'decline-quote': 'The repair will not go ahead.',
  'confirm-completion': 'This confirms the repair is finished.',
  'complete-repair': 'The homeowner is asked to confirm the repair is finished.',
}
const DESTRUCTIVE = ['cancel', 'decline-quote']

// Runs the action; a 409 is handled by the hook (refetch plus conflict), anything else surfaces here.
function ActionButton({ action, variant, mutation }) {
  const { mutateAsync, isPending, error, errors } = mutation
  const run = () => mutateAsync({ action })
  const message = errors[0] ?? error?.message

  if (action.confirm) {
    return (
      <ConfirmDialog
        trigger={<Button variant={variant}>{action.label}</Button>}
        title={`${action.label}?`}
        description={typeof action.confirm === 'string' ? action.confirm : (CONFIRM_TEXT[action.id] ?? 'This cannot be undone.')}
        confirmLabel={action.label}
        loadingLabel="Working…"
        tone={DESTRUCTIVE.includes(action.id) ? 'destructive' : 'neutral'}
        onConfirm={run}
        error={message}
      />
    )
  }
  const gated = Boolean(action.availableFrom)
  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant={variant} disabled={gated} loading={isPending} loadingLabel="Working…" onClick={run}>
        {action.label}
      </Button>
      {gated && <p className="tabular text-caption text-fg-2">Available from {formatDateTime(action.availableFrom)}</p>}
      {message && !gated && <p role="alert" className="text-caption text-error">{message}</p>}
    </div>
  )
}

// Actions that take typed input are rendered by `renderActionForm(action, mutation)` (later tasks).
// While it returns nothing, they show as a disabled placeholder.
export default function ActionsPanel({ view, role, mutation, renderActionForm }) {
  const [, refresh] = useReducer((n) => n + 1, 0)
  const actions = actionsFor(view, role)
  const gatedUntil = actions.find((a) => a.availableFrom)?.availableFrom
  useCountdown(gatedUntil, { onExpire: refresh })
  if (!actions.length) return null

  return (
    <section data-panel="actions" aria-labelledby="panel-actions" className="flex flex-col gap-3">
      <h2 id="panel-actions">What you can do</h2>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
        {actions.map((action, i) => {
          const variant = i === 0 ? 'primary' : 'secondary'
          if (action.bodyFields.length) {
            const form = renderActionForm?.(action, mutation)
            if (form) return <div key={action.id} className="w-full">{form}</div>
            return <Button key={action.id} variant={variant} disabled>{action.label} (coming next)</Button>
          }
          return <ActionButton key={action.id} action={action} variant={variant} mutation={mutation} />
        })}
      </div>
    </section>
  )
}
