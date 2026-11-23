import { useId, useState } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { CircleAlert } from 'lucide-react'
import Button from './Button.jsx'
import Input from './Input.jsx'
import { cn } from './cn.js'
import './ui.css'

// onConfirm may return a promise. The dialog closes when it resolves and stays open when it
// rejects; show the failure through the `error` prop.
export default function ConfirmDialog({
  trigger, open: openProp, onOpenChange, title, description, confirmLabel, loadingLabel,
  cancelLabel = 'Cancel', tone = 'destructive', onConfirm, typeToConfirm, error, children,
}) {
  const typedId = useId()
  const [innerOpen, setInnerOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const open = openProp ?? innerOpen

  function setOpen(next) {
    if (pending) return
    setInnerOpen(next)
    if (!next) setTyped('')
    onOpenChange?.(next)
  }

  async function confirm() {
    setPending(true)
    try {
      await onConfirm?.()
      setPending(false)
      setInnerOpen(false)
      setTyped('')
      onOpenChange?.(false)
    } catch {
      setPending(false)
    }
  }

  const blocked = typeToConfirm != null && typed !== typeToConfirm

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>}
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="ui-overlay fixed inset-0 bg-scrim" />
        <AlertDialog.Content className="ui-dialog fixed left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-surface p-4 sm:p-6 shadow-overlay">
          <AlertDialog.Title className="font-display text-h3">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-fg-2">{description}</AlertDialog.Description>
          {children}
          {typeToConfirm != null && (
            <div className="mt-4 flex flex-col gap-2">
              <label htmlFor={typedId} className="font-medium">
                Type <span className="tabular">{typeToConfirm}</span> to confirm
              </label>
              <Input id={typedId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
            </div>
          )}
          {error && (
            <p role="alert" className="mt-4 flex items-start gap-2 text-caption text-error">
              <CircleAlert size={16} strokeWidth={1.75} aria-hidden="true" className="mt-px shrink-0" />
              {error}
            </p>
          )}
          <div className={cn('mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end')}>
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={pending}>{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <Button
              variant={tone === 'destructive' ? 'destructive' : 'primary'}
              disabled={blocked}
              loading={pending}
              loadingLabel={loadingLabel}
              onClick={confirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
