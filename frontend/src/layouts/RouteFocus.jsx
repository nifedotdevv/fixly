import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

const RETRY_MS = 3000

// Moves focus to the page h1 (or main) when the path changes, never on first load.
// If the h1 isn't there yet (a skeleton is showing), main takes focus and the h1 takes over
// once it appears, unless the user has already moved focus elsewhere.
export default function RouteFocus() {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    const main = document.getElementById('main')
    if (!main) return
    const focusHeading = () => {
      const heading = main.querySelector('h1')
      if (!heading) return false
      heading.setAttribute('tabindex', '-1')
      heading.focus()
      return true
    }
    if (focusHeading()) return
    main.focus()
    const observer = new MutationObserver(() => {
      const active = document.activeElement
      if (active !== main && active !== document.body) return observer.disconnect()
      if (focusHeading()) observer.disconnect()
    })
    observer.observe(main, { childList: true, subtree: true })
    const timer = setTimeout(() => observer.disconnect(), RETRY_MS)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [pathname])
  return null
}
