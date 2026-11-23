import { useEffect, useState } from 'react'

// True once the page has scrolled past `offset` pixels. Drives the nav shadow.
export function useScrolled(offset = 4) {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > offset)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [offset])
  return scrolled
}
