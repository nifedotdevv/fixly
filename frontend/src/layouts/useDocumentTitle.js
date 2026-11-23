import { useEffect } from 'react'

// Sets the tab title to "Page — Fixly" while the calling page is mounted.
export function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title
    document.title = `${title} — Fixly`
    return () => { document.title = previous }
  }, [title])
}
