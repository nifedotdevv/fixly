import { useLayoutEffect, useRef, useState } from 'react'
import { contrastRatio, toRgb } from './contrast.js'

const SCALE = [
  { name: 'caption', size: '13px', cls: 'text-caption' },
  { name: 'body', size: '16px', cls: 'text-body' },
  { name: 'h3', size: '20px', cls: 'text-h3' },
  { name: 'h2', size: '25px', cls: 'text-h2' },
  { name: 'h1', size: '31px', cls: 'text-h1' },
  { name: 'display', size: '39px', cls: 'text-display' },
]

const COLORS = [
  ['bg', 'bg-bg'], ['surface', 'bg-surface'], ['surface-inset', 'bg-surface-inset'],
  ['fg', 'bg-fg'], ['fg-2', 'bg-fg-2'], ['muted', 'bg-muted'],
  ['border', 'bg-border'], ['border-strong', 'bg-border-strong'], ['ink', 'bg-ink'],
  ['accent', 'bg-accent'], ['accent-hover', 'bg-accent-hover'], ['accent-soft', 'bg-accent-soft'],
  ['accent-fg', 'bg-accent-fg'],
  ['success', 'bg-success'], ['success-soft', 'bg-success-soft'],
  ['warning', 'bg-warning'], ['warning-soft', 'bg-warning-soft'], ['warning-mark', 'bg-warning-mark'],
  ['error', 'bg-error'], ['error-soft', 'bg-error-soft'],
  ['info', 'bg-info'], ['info-soft', 'bg-info-soft'],
]

// Literal class strings so Tailwind can see them.
const FG = {
  fg: 'text-fg', 'fg-2': 'text-fg-2', muted: 'text-muted', 'accent-fg': 'text-accent-fg',
  success: 'text-success', warning: 'text-warning', error: 'text-error', info: 'text-info',
}
const BG = {
  bg: 'bg-bg', surface: 'bg-surface', 'surface-inset': 'bg-surface-inset',
  accent: 'bg-accent', 'accent-hover': 'bg-accent-hover', 'accent-soft': 'bg-accent-soft',
  'success-soft': 'bg-success-soft', 'warning-soft': 'bg-warning-soft',
  'error-soft': 'bg-error-soft', 'info-soft': 'bg-info-soft',
}

const PAIRS = [
  ...['fg', 'fg-2', 'muted'].flatMap((f) => ['bg', 'surface', 'surface-inset'].map((b) => [f, b])),
  ['accent-fg', 'accent'], ['accent-fg', 'accent-hover'], ['fg', 'accent-soft'],
  ...['success', 'warning', 'error', 'info'].flatMap((s) => [[s, `${s}-soft`], [s, 'bg']]),
]

const SPACING = [1, 2, 3, 4, 6, 8, 12, 16]
const SPACING_CLS = { 1: 'w-1', 2: 'w-2', 3: 'w-3', 4: 'w-4', 6: 'w-6', 8: 'w-8', 12: 'w-12', 16: 'w-16' }

function ContrastRow({ fgName, bgName }) {
  const ref = useRef(null)
  const [ratio, setRatio] = useState(null)

  useLayoutEffect(() => {
    const style = getComputedStyle(ref.current)
    const fg = toRgb(style.color)
    const bg = toRgb(style.backgroundColor)
    if (fg && bg) setRatio(contrastRatio(fg, bg))
  }, [])

  const pass = ratio !== null && ratio >= 4.5
  return (
    <tr className="border-b border-border">
      <td className="py-2 pr-4">{fgName} on {bgName}</td>
      <td className="py-2 pr-4">
        <span ref={ref} className={`${FG[fgName]} ${BG[bgName]} rounded-sm px-3 py-1 border border-border`}>
          Quote sent
        </span>
      </td>
      <td className="tabular py-2 pr-4 text-right">{ratio === null ? 'n/a' : `${ratio.toFixed(2)}:1`}</td>
      <td className={`py-2 font-medium ${pass ? 'text-success' : 'text-error'}`}>
        {ratio === null ? 'not measured' : pass ? 'Pass' : 'Fail'}
      </td>
    </tr>
  )
}

export default function Specimen() {
  return (
    <main className="mx-auto max-w-[1200px] p-4 sm:p-8 space-y-12">
      <h1>Design specimen</h1>

      <section className="space-y-4">
        <h2>Type scale</h2>
        <div className="space-y-4">
          {SCALE.map(({ name, size, cls }) => (
            <div key={name} className="flex items-baseline gap-6 border-b border-border pb-3">
              <span className="tabular text-caption text-muted w-28 shrink-0">{name} {size}</span>
              <p className={`${cls} font-display`} style={{ fontStretch: '88%', fontWeight: 720 }}>
                Fix the leaking tap
              </p>
            </div>
          ))}
          <div className="flex items-baseline gap-6">
            <span className="tabular text-caption text-muted w-28 shrink-0">tabular</span>
            <p className="tabular text-h3">₦12,500.00 &nbsp; ₦88,100.00</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2>Colour tokens</h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {COLORS.map(([name, cls]) => (
            <li key={name} className="flex items-center gap-3">
              <span className={`${cls} size-10 rounded-sm border border-border shrink-0`} />
              <span className="text-caption">{name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2>Contrast</h2>
        <p className="text-fg-2 max-w-[68ch]">Every text and background pair in use, measured from the resolved colours. Text needs 4.5:1.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-border-strong text-left">
                <th className="py-2 pr-4 font-medium">Pair</th>
                <th className="py-2 pr-4 font-medium">Sample</th>
                <th className="py-2 pr-4 font-medium text-right">Ratio</th>
                <th className="py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {PAIRS.map(([f, b]) => <ContrastRow key={`${f}-${b}`} fgName={f} bgName={b} />)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <h2>Spacing</h2>
        <ul className="space-y-2">
          {SPACING.map((n) => (
            <li key={n} className="flex items-center gap-4">
              <span className="tabular text-caption text-muted w-28 shrink-0">{n} ({n * 4}px)</span>
              <span className={`${SPACING_CLS[n]} h-3 bg-ink block`} />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2>Radius, shadow and focus</h2>
        <div className="flex flex-wrap gap-6 items-center">
          <div className="bg-surface border border-border rounded-sm size-24 p-3 text-caption">radius-sm 4px</div>
          <div className="bg-surface border border-border rounded-md size-24 p-3 text-caption">radius-md 8px</div>
          <div className="bg-surface shadow-overlay rounded-md size-24 p-3 text-caption">shadow-overlay</div>
          <button type="button" className="bg-accent text-accent-fg rounded-sm h-11 px-4">
            Tab here to see the focus ring
          </button>
        </div>
      </section>
    </main>
  )
}
