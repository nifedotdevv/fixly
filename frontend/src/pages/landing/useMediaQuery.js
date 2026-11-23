import { useSyncExternalStore } from 'react'

// False where matchMedia is missing (jsdom, very old browsers), so layouts fall back to the stacked form.
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== 'function') return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false),
    () => false,
  )
}
