import { useEffect } from 'react'

export const LINK = 'text-accent underline underline-offset-4 hover:text-accent-hover'

// Joi errors arrive as strings like "password is invalid"; field errors elsewhere as {field, message}.
export function fieldErrors(errors, names) {
  const out = {}
  for (const e of errors ?? []) {
    const field = typeof e === 'string' ? e.split(' ')[0] : e?.field
    const message = typeof e === 'string' ? `Check ${field}` : e?.message
    if (names.includes(field) && !out[field]) out[field] = message
  }
  return out
}

// Moves focus to the first control marked invalid after a failed submit.
export function useFocusFirstInvalid(formRef, signal) {
  useEffect(() => {
    if (signal) formRef.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [formRef, signal])
}
