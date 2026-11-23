import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, ChevronLeft, ChevronRight, ClipboardCheck, HardHat, History, ReceiptText, Search, Wrench } from 'lucide-react'
import { LinkButton } from '../../components/ui/index.js'
import { HistoryMock, InspectionMock, QuoteMock, StagesMock } from './mocks.jsx'

const TABS = [
  {
    id: 'inspection', label: 'Inspection', Icon: ClipboardCheck, Media: InspectionMock,
    heading: 'See the work before anyone names a price.',
    body: 'Describe the fault and choose a window. The artisan accepts with an inspection fee before they set foot in your home, so you know the cost of looking before anyone arrives.',
    link: { label: 'Find an artisan', to: '/artisans' },
  },
  {
    id: 'quote', label: 'Quote', Icon: ReceiptText, Media: QuoteMock,
    heading: 'One price, in writing. Your call.',
    body: 'After the visit, the artisan sends a single fixed quote with the repair window attached. Approve it, decline it or let it lapse. The number cannot move once it is sent.',
    link: { label: 'Start as a homeowner', to: '/register' },
  },
  {
    id: 'repair', label: 'Repair', Icon: Wrench, Media: StagesMock,
    heading: 'A 70% deposit holds the date.',
    body: 'Once the deposit is recorded, that window closes to every other job. When the artisan reports the work done, you check it first, and confirm or flag a problem before the balance is due.',
    link: { label: 'See how a job runs', to: '#how' },
  },
  {
    id: 'record', label: 'Record', Icon: History, Media: HistoryMock,
    heading: 'Every step, named and timed.',
    body: 'Who acted, when, and what was paid sits on the request in order. If anyone remembers it differently later, the record answers for you.',
    link: { label: 'Create an account', to: '/register' },
  },
]

const iconProps = { strokeWidth: 1.75, 'aria-hidden': true }

function ChevronButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="focus-on-band inline-flex size-8 shrink-0 items-center justify-center rounded-full text-on-band transition-[background-color] duration-(--duration-fast) ease-out hover:bg-on-band/15"
    >
      {children}
    </button>
  )
}

function TextLink({ to, children }) {
  const cls = 'link mt-6 inline-flex items-center gap-2 text-small'
  const inner = (
    <>
      {children}
      <ArrowRight size={16} {...iconProps} />
    </>
  )
  return to.startsWith('#') ? <a href={to} className={cls}>{inner}</a> : <Link to={to} className={cls}>{inner}</Link>
}

export default function FeatureTabs() {
  const [active, setActive] = useState(0)
  const refs = useRef([])

  const go = (i, focus = false) => {
    const next = (i + TABS.length) % TABS.length
    setActive(next)
    if (focus) refs.current[next]?.focus()
  }

  const onKeyDown = (e) => {
    const keys = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: TABS.length - 1 }
    if (!(e.key in keys)) return
    e.preventDefault()
    go(keys[e.key], true)
  }

  return (
    <section
      aria-labelledby="hero-title"
      className="hero-gradient hero-tabs relative mx-2 overflow-hidden rounded-xl px-2 pb-12 text-on-band sm:mx-6 sm:pb-24 lg:rounded-3xl lg:pb-30"
    >
      <div className="mx-auto max-w-[900px] px-2 pt-16 text-center sm:px-4 lg:pt-30">
        <h1 id="hero-title" className="mx-auto max-w-[820px] text-display text-on-band sm:text-display-md lg:text-display-xl">
          Home repairs with every step on record.
        </h1>
        <p className="mx-auto mt-6 max-w-[560px] text-body text-on-band/90 sm:text-lead">
          Pick a plumber, electrician or other artisan, ask for an inspection, and see who has to act next until the repair is done.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <LinkButton variant="light" size="large" to="/artisans" className="focus-on-band">
            <Search size={20} {...iconProps} />
            Find an artisan
          </LinkButton>
          <LinkButton variant="light" size="large" to="/register?role=artisan" className="focus-on-band">
            <HardHat size={20} {...iconProps} />
            I&apos;m an artisan
          </LinkButton>
        </div>
        <p className="mt-4 text-caption font-medium text-on-band/85">
          Payments are recorded on each request. Fixly does not take money online yet.
        </p>
      </div>

      <div className="relative mx-auto mt-12 w-fit lg:mt-16">
        <div className="flex items-center justify-center gap-2 px-2">
          <ChevronButton label="Previous feature" onClick={() => go(active - 1)}>
            <ChevronLeft size={20} {...iconProps} />
          </ChevronButton>
          <div className="overflow-x-auto p-1">
            <div role="tablist" aria-label="What Fixly covers" onKeyDown={onKeyDown} className="flex gap-2">
              {TABS.map(({ id, label, Icon }, i) => (
                <button
                  key={id}
                  ref={(el) => { refs.current[i] = el }}
                  type="button"
                  role="tab"
                  id={`tab-${id}`}
                  aria-label={label}
                  aria-selected={i === active}
                  aria-controls={`panel-${id}`}
                  tabIndex={i === active ? 0 : -1}
                  onClick={() => go(i)}
                  className={`focus-on-band inline-flex size-12 shrink-0 items-center justify-center rounded-[18px] border transition-[background-color,border-color,color,box-shadow] duration-(--duration-fast) ease-out sm:size-14 ${
                    i === active
                      ? 'border-on-band bg-on-band text-on-bright shadow-[0_0_0_3px_var(--color-lime)]'
                      : 'border-on-band/30 bg-on-band/10 text-on-band hover:bg-on-band/20'
                  }`}
                >
                  <Icon size={24} {...iconProps} />
                </button>
              ))}
            </div>
          </div>
          <ChevronButton label="Next feature" onClick={() => go(active + 1)}>
            <ChevronRight size={20} {...iconProps} />
          </ChevronButton>
        </div>
        <svg aria-hidden="true" className="tab-notch" style={{ '--i': active }} viewBox="0 0 40 18" fill="currentColor">
          <path d="M9 0H31C27 0 25 2.5 25 6V11C25 15.5 28.5 18 40 18H0C11.5 18 15 15.5 15 11V6C15 2.5 13 0 9 0Z" />
        </svg>
      </div>

      <div className="relative mx-auto mt-3 w-full max-w-[920px] rounded-xl bg-bg p-6 text-fg shadow-raised sm:p-8 lg:rounded-2xl lg:p-12">
        {TABS.map(({ id, label, Icon, Media, heading, body, link }, i) => (
          <div
            key={id}
            role="tabpanel"
            id={`panel-${id}`}
            aria-labelledby={`tab-${id}`}
            hidden={i !== active}
            className="panel-in grid items-center gap-8 lg:grid-cols-[300px_1fr] lg:gap-10"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex size-6 items-center justify-center rounded-[7px] bg-lime text-on-bright">
                  <Icon size={16} {...iconProps} />
                </span>
                <span className="text-small font-medium">{label}</span>
              </div>
              <h2 className="heading-serif mt-4 text-[1.75rem] leading-[1.1] sm:text-display-xs">{heading}</h2>
              <p className="mt-4 text-small text-muted">{body}</p>
              <TextLink to={link.to}>{link.label}</TextLink>
            </div>
            <div className="media-soft flex min-h-[289px] items-center rounded-lg p-4 sm:p-8">
              <Media />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
