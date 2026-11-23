import { useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { LinkButton } from '../../components/ui/index.js'
import { MiniMock } from './mocks.jsx'
import { useMediaQuery } from './useMediaQuery.js'

const CARDS = [
  {
    title: 'Request', text: 'You describe the job and pick an inspection time.',
    checks: ['Pick an artisan by trade and area', 'Describe the job in your own words', 'Choose an inspection time'],
  },
  {
    title: 'Inspect', text: 'The artisan accepts, sets a fee and visits.',
    checks: ['The artisan accepts or declines', 'The inspection fee is recorded on the request', 'The artisan marks the inspection done'],
  },
  {
    title: 'Quote', text: 'One fixed quote that you approve or decline.',
    checks: ['One total with the repair window', 'Approve or decline before it expires', 'A changed quote means a new request'],
  },
  {
    title: 'Repair', text: 'A deposit books it and the balance closes it.',
    checks: ['A 70% deposit books the repair', 'Report a problem before you confirm', 'The 30% balance closes the job and opens the review'],
  },
]

const GRADIENTS = ['media-lime', 'media-teal', 'media-lemon', 'media-lime']

export default function StageCards() {
  const wide = useMediaQuery('(min-width: 64rem)')
  const [open, setOpen] = useState(0)
  const buttons = useRef([])

  const onKeyDown = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next = (i + (e.key === 'ArrowRight' ? 1 : -1) + CARDS.length) % CARDS.length
    buttons.current[next]?.focus()
  }

  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className="soft-gradient mx-2 mt-12 rounded-xl py-12 sm:mx-6 lg:mt-30 lg:rounded-3xl lg:py-30"
    >
      <div className="mx-auto max-w-[640px] px-4 text-center">
        <h2 id="how-title" className="text-display-xs sm:text-display-md">
          One request, seen the same way by both sides
        </h2>
        <p className="mx-auto mt-6 max-w-[560px] text-body text-muted sm:text-lead">
          Homeowners and artisans work from the same request, so nobody has to chase the other to find out where a job stands.
        </p>
        <LinkButton size="large" to="/artisans" className="mt-8">Find an artisan</LinkButton>
      </div>

      <div className="stage-row mx-auto mt-12 grid w-full max-w-[1248px] gap-6 px-4 sm:grid-cols-2 sm:px-8 lg:mt-16 lg:px-6">
        {CARDS.map((card, i) => {
          const expanded = !wide || open === i
          const extraId = `stage-extra-${i}`
          return (
            <div
              key={card.title}
              data-open={expanded}
              onPointerEnter={(e) => { if (wide && e.pointerType === 'mouse') setOpen(i) }}
              className={`stage-card relative flex flex-col overflow-hidden rounded-xl bg-surface p-6 lg:rounded-2xl lg:p-8 ${
                wide && expanded ? 'shadow-raised' : ''
              }`}
            >
              <h3 className="text-h3">
                {wide ? (
                  <button
                    type="button"
                    ref={(el) => { buttons.current[i] = el }}
                    aria-expanded={open === i}
                    aria-controls={extraId}
                    onClick={() => setOpen(i)}
                    onFocus={() => setOpen(i)}
                    onKeyDown={(e) => onKeyDown(e, i)}
                    className="min-h-11 w-full rounded-sm text-left"
                  >
                    {card.title}
                  </button>
                ) : (
                  card.title
                )}
              </h3>
              <p className="mt-1 text-small text-muted">{card.text}</p>
              <div id={extraId} className="stage-extra mt-6 flex flex-1 flex-col justify-between gap-6">
                <ul>
                  {card.checks.map((line, n) => (
                    <li key={line} className="relative flex items-start gap-3 pb-3 text-small text-fg-2 last:pb-0">
                      {n < card.checks.length - 1 && (
                        <span aria-hidden="true" className="absolute top-6 bottom-1 left-2.5 w-px bg-divider" />
                      )}
                      <span className="relative flex size-5 shrink-0 items-center justify-center rounded-full bg-lime text-on-bright">
                        <Check size={12} strokeWidth={2.25} aria-hidden="true" />
                      </span>
                      {line}
                    </li>
                  ))}
                </ul>
                <div className={`${GRADIENTS[i]} -mx-2 rounded-xl p-2 lg:-mx-4 lg:-mb-12 lg:rounded-b-none lg:p-3 lg:pb-14`}>
                  <MiniMock stage={card.title} />
                </div>
              </div>
              {wide && (
                <div className={`stage-peek ${GRADIENTS[i]} absolute inset-x-0 bottom-0 h-[58%] rounded-t-[999px] px-5 pt-24`}>
                  <MiniMock stage={card.title} compact />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
