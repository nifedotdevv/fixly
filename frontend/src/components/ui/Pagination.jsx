import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button.jsx'

export default function Pagination({ page, totalPages, onChange }) {
  return (
    <nav aria-label="Pagination" className="flex items-center gap-4">
      <Button variant="secondary" size="compact" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
        Prev
      </Button>
      <p className="text-caption text-fg-2">Page <span className="tabular">{page}</span> of <span className="tabular">{totalPages}</span></p>
      <Button variant="secondary" size="compact" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
        <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </nav>
  )
}
