import { useReducer } from 'react'
import { Button, ConfirmDialog } from '../../../components/ui/index.js'
import { actionsFor } from '../../../lib/requestStatus.js'
import { formatDateTime } from '../../../lib/time.js'
import { useCountdown } from '../../../lib/useCountdown.js'
import { otherSide, personOf } from './format.js'

const CONFIRM_TEXT = {
  'decline-quote': 'The repair will not go ahead.',
  'confirm-completion': 'This confirms the repair is finished.',
  'complete-repair': 'The homeowner is asked to confirm the repair is finished.',
  'complete-inspection': 'You can then send the homeowner your quote for the repair.',
}
const CONFIRM_TITLE = {
  'decline-quote': (name) => `Decline ${name}'s quote?`,
  cancel: (name) => `Cancel your request to ${name}?`,
  'confirm-completion': (name) => `Confirm ${name}'s repair is finished?`,
  'complete-inspection': (name) => `Mark the inspection for ${name} as done?`,
  'complete-repair': (name) => `Report the repair for ${name} as finished?`,
}
const DESTRUCTIVE = ['cancel', 'decline-quote']

// Runs the action; a 409 is handled by the hook (refetch plus conflict), anything else surfaces here.
function ActionButton({ action, variant, mutation, name }) {
  const { mutateAsync, isPending, error, errors } = mutation
  const run = () => mutateAsync({ action })
  const message = errors[0] ?? error?.message

  const gated = Boolean(action.availableFrom)
  if (action.confirm && !gated) {
    return (
      <ConfirmDialog
        trigger={<Button variant={variant}>{action.label}</Button>}
        title={CONFIRM_TITLE[action.id]?.(name) ?? `${action.label} for ${name}?`}
        description={typeof action.confirm === 'string' ? action.confirm : (CONFIRM_TEXT[action.id] ?? 'This cannot be undone.')}
        confirmLabel={action.label}
        loadingLabel="Working…"
        tone={DESTRUCTIVE.includes(action.id) ? 'destructive' : 'neutral'}
        onConfirm={run}
        error={message}
      />
    )
  }
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

// Actions that take typed input are rendered by `renderActionForm(action, mutation)`.
// A missing form renders nothing (and warns in dev).
export default function ActionsPanel({ view, role, mutation, renderActionForm }) {
  const [, refresh] = useReducer((n) => n + 1, 0)
  const actions = actionsFor(view, role)
  const { name } = personOf(view, otherSide(role))
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
            if (import.meta.env.DEV) console.warn(`No action form for "${action.id}"`)
            return null
          }
          return <ActionButton key={action.id} action={action} variant={variant} mutation={mutation} name={name} />
        })}
      </div>
    </section>
  )
}
