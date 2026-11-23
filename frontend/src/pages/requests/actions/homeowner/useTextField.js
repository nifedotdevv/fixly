export const MAX = 2000

export const messageOf = (mutation) => mutation.errors?.join(' ') || mutation.error?.message || undefined

export const counter = (n) => `${n} of ${MAX} characters`
