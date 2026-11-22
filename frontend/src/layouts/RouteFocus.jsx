import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

// Moves focus to the page h1 (or main) when the path changes, never on first load.
export default function RouteFocus() {
  const { pathname } = useLocation()
  const previous = useRef(pathname)
  useEffect(() => {
    if (previous.current === pathname) return
    previous.current = pathname
    const main = document.getElementById('main')
    const heading = main?.querySelector('h1')
    if (heading) {
      heading.setAttribute('tabindex', '-1')
      heading.focus()
    } else {
      main?.focus()
    }
  }, [pathname])
  return null
}
