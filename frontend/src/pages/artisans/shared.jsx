// Re-exported so pages/requests/NewRequest.jsx keeps working; prefer importing from ./helpers.js.
import { BrickWall, Car, Flame, Hammer, PaintRoller, PlugZap, Star, ToolCase, Wrench } from 'lucide-react'

const GLYPHS = {
  Plumber: Wrench,
  Electrician: PlugZap,
  Carpenter: Hammer,
  Painter: PaintRoller,
  Welder: Flame,
  'Brick Layer': BrickWall,
  'Auto Mechanic': Car,
  Others: ToolCase,
}

export function Profession({ name }) {
  const Glyph = GLYPHS[name] ?? ToolCase
  return (
    <span className="inline-flex items-center gap-1.5">
      <Glyph size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
      {name}
    </span>
  )
}

// No stars until there is at least one review.
export function Rating({ summary }) {
  const count = summary?.count ?? 0
  if (!count || summary.average == null) return <span className="text-muted">No reviews yet</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <Star size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 fill-accent text-ink" />
      <span className="tabular">
        {Number(summary.average).toFixed(1)}{' '}
        <span className="text-muted">({count} {count === 1 ? 'review' : 'reviews'})</span>
      </span>
    </span>
  )
}

// Profession as a 24px accent square holding its glyph, then the label.
export function ProfessionChip({ name }) {
  const Glyph = GLYPHS[name] ?? ToolCase
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-accent text-on-bright">
        <Glyph size={16} strokeWidth={1.75} aria-hidden="true" />
      </span>
      {name}
    </span>
  )
}
