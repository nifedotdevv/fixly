import { Link } from 'react-router'
import { ArrowRight, Check, House, Wrench } from 'lucide-react'

const CARDS = [
  {
    id: 'homeowners', label: 'For homeowners', Icon: House, tone: 'media-lime',
    title: 'See where your repair stands',
    text: 'Every request shows what happens next and who has to do it.',
    checks: ['Pick an artisan by trade and area', 'Approve or decline one fixed quote', 'Report a problem before you confirm the job'],
    link: { label: 'Sign up as a homeowner', to: '/register' },
  },
  {
    id: 'artisans', label: 'For artisans', Icon: Wrench, tone: 'media-lemon',
    title: 'Price each job yourself',
    text: 'You set the inspection fee, write the quote and see new requests as they arrive.',
    checks: ['Accept or decline each request', 'Booked times are closed to other requests', 'Homeowners rate you after a finished job'],
    link: { label: 'Sign up as an artisan', to: '/register?role=artisan' },
  },
]

export default function Audiences() {
  return (
    <section
      aria-labelledby="audiences-title"
      className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-8 lg:px-0 lg:py-30"
    >
      <h2 id="audiences-title" className="mx-auto max-w-[640px] text-center text-display-xs sm:text-display-md lg:text-display-lg">
        Built for both sides of the job
      </h2>
      <div className="mt-12 grid gap-6 lg:mt-16 lg:grid-cols-2">
        {CARDS.map(({ id, label, Icon, tone, title, text, checks, link }) => (
          <div key={id} className={`${tone} flex flex-col overflow-hidden rounded-xl p-2 lg:rounded-2xl lg:p-3`}>
            <div className="flex flex-1 flex-col rounded-[24px] bg-surface p-8 lg:rounded-[38px] lg:p-12">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-[7px] bg-lime text-on-bright">
                  <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="text-body font-medium">{label}</span>
              </div>
              <h3 className="mt-4 text-h2 lg:text-display-xs">{title}</h3>
              <p className="mt-4 text-body text-muted">{text}</p>
              <ul className="mt-6 space-y-3">
                {checks.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-small text-fg-2">
                    <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-surface text-fg">
                      <Check size={12} strokeWidth={2.25} aria-hidden="true" />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              <Link to={link.to} className="link mt-8 inline-flex items-center gap-2 self-start text-small">
                {link.label}
                <ArrowRight size={16} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
