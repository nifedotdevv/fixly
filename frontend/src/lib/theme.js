import { useSyncExternalStore } from 'react'

// Theme preference: 'system' (follow the OS), 'light' or 'dark'. Stored per browser.
// index.html applies the stored value before first paint; this module keeps it in sync after that.
export const THEMES = ['system', 'light', 'dark']
const KEY = 'fixly-theme'
const META = { light: '#FCFBF8', dark: '#09111E' }
const listeners = new Set()

function read() {
  try {
    const v = localStorage.getItem(KEY)
    return THEMES.includes(v) ? v : 'system'
  } catch {
    return 'system'
  }
}

let current = typeof window === 'undefined' ? 'system' : read()

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null)

export function resolvedTheme(pref = current) {
  if (pref !== 'system') return pref
  return media()?.matches ? 'dark' : 'light'
}

function apply() {
  const root = document.documentElement
  if (current === 'system') delete root.dataset.theme
  else root.dataset.theme = current
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[resolvedTheme()])
}

export function setTheme(pref) {
  current = THEMES.includes(pref) ? pref : 'system'
  try {
    if (current === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, current)
  } catch { /* storage blocked: the choice lasts for this page only */ }
  apply()
  listeners.forEach((l) => l())
}

function subscribe(listener) {
  listeners.add(listener)
  const mq = media()
  const onOs = () => { apply(); listener() }
  mq?.addEventListener?.('change', onOs)
  return () => {
    listeners.delete(listener)
    mq?.removeEventListener?.('change', onOs)
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current, () => 'system')
  return { theme, resolved: resolvedTheme(theme), setTheme }
}
