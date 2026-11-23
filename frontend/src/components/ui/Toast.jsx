import { useCallback, useMemo, useRef, useState } from 'react'
import * as RadixToast from '@radix-ui/react-toast'
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { ToastContext } from './toast-context.js'
import { MOTION, cn } from './cn.js'
import './ui.css'

const TONES = {
  neutral: { Icon: Info, cls: 'text-info' },
  success: { Icon: CircleCheck, cls: 'text-success' },
  error: { Icon: CircleAlert, cls: 'text-error' },
}

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const nextId = useRef(0)

  const toast = useCallback(({ title, tone = 'neutral' }) => {
    nextId.current += 1
    setItems((cur) => [...cur, { id: nextId.current, title, tone }])
  }, [])
  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider duration={5000} label="Notifications">
        {children}
        {items.map(({ id, title, tone }) => {
          const { Icon, cls } = TONES[tone] ?? TONES.neutral
          return (
            <RadixToast.Root
              key={id}
              type="background"
              onOpenChange={(open) => { if (!open) setItems((cur) => cur.filter((t) => t.id !== id)) }}
              className="ui-toast flex items-start gap-3 rounded-md border border-border bg-surface p-4 shadow-overlay"
            >
              <Icon size={20} strokeWidth={1.75} aria-hidden="true" className={cn('mt-0.5 shrink-0', cls)} />
              <RadixToast.Title className="flex-1 text-fg">{title}</RadixToast.Title>
              <RadixToast.Close
                aria-label="Dismiss"
                className={cn('-m-2 size-11 inline-flex items-center justify-center rounded-sm text-fg-2 hover:bg-surface-2', MOTION)}
              >
                <X size={16} strokeWidth={1.75} aria-hidden="true" />
              </RadixToast.Close>
            </RadixToast.Root>
          )
        })}
        <RadixToast.Viewport className="ui-toast-viewport fixed bottom-0 right-0 z-50 flex w-full max-w-sm flex-col gap-3 p-4 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  )
}
