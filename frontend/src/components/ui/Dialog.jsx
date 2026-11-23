import * as RadixDialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { MOTION, cn } from './cn.js'
import './ui.css'

const OVERLAY = 'ui-overlay fixed inset-0 bg-scrim'
const PANEL = 'ui-dialog fixed left-1/2 top-1/2 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md border border-border bg-surface p-4 sm:p-6 shadow-overlay'

export default function Dialog({ open, onOpenChange, trigger, title, description, children, className }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={OVERLAY} />
        <RadixDialog.Content className={cn(PANEL, 'max-h-[90vh] overflow-y-auto', className)}>
          <RadixDialog.Title className="font-display text-h3 pr-10">{title}</RadixDialog.Title>
          {description
            ? <RadixDialog.Description className="mt-2 text-fg-2">{description}</RadixDialog.Description>
            : null}
          <div className="mt-4">{children}</div>
          <RadixDialog.Close
            aria-label="Close"
            className={cn('absolute right-2 top-2 size-11 inline-flex items-center justify-center rounded-sm text-fg-2 hover:bg-surface-2', MOTION)}
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </RadixDialog.Close>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
