import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button.jsx'

export default function Pagination({ page, totalPages, onChange }) {
  const prevRef = useRef(null)
  const nextRef = useRef(null)

  // A button that disables itself while focused drops focus; hand it to the other button.
  function go(target) {
    onChange(target)
    if (target <= 1) nextRef.current?.focus()
    else if (target >= totalPages) prevRef.current?.focus()
  }

  return (
    <nav aria-label="Pagination" className="flex items-center gap-4">
      <Button ref={prevRef} variant="secondary" disabled={page <= 1} onClick={() => go(page - 1)}>
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        Prev
      </Button>
      <p className="text-caption text-fg-2">Page <span className="tabular">{page}</span> of <span className="tabular">{totalPages}</span></p>
      <Button ref={nextRef} variant="secondary" disabled={page >= totalPages} onClick={() => go(page + 1)}>
        Next
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </nav>
  )
}
