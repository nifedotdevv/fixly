import { ClipboardList, Inbox, UserRound, Lock, Star } from 'lucide-react'
import { StatusBadge } from '../../components/ui/index.js'
import { formatMoney } from '../../lib/money.js'
import { MILESTONES } from '../../lib/requestStatus.js'
import { HISTORY, JOB, LIST_ROWS, REPAIR_FROM, STAGE_ROWS, wat } from './sampleData.js'

const money = (amount) => formatMoney({ amount })

export function SampleCaption({ className = '' }) {
  return <p className={`text-caption text-muted ${className}`}>Sample data</p>
}

function Rows({ rows, compact = false }) {
  const text = compact ? 'text-caption' : 'text-small'
  return (
    <dl>
      {rows.map(([label, value]) => (
        <div
          key={label}
          className={`flex items-baseline justify-between border-t border-border first:border-t-0 ${
            compact ? 'flex-wrap gap-x-2 py-1' : 'gap-4 py-2'
          }`}
        >
          <dt className={`${text} text-muted`}>{label}</dt>
          <dd className={`text-right ${text} text-fg`}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* A framed mock of the signed-in app: a narrow nav rail (from 640px) and a content area.
   The whole mock is aria-hidden and inert, and carries its own "Sample data" caption unless
   `footer` replaces it. */

const RAIL = [ClipboardList, Inbox, UserRound]

export function AppWindow({ title, active = 0, raised = false, footer, className = '', children }) {
  return (
    <div aria-hidden="true" className={`flex w-full flex-col gap-3 ${className}`}>
      <div className={`flex overflow-hidden rounded-lg bg-surface ${raised ? 'shadow-raised' : 'shadow-card'}`}>
        <div className="hidden w-14 shrink-0 flex-col gap-2 border-r border-border py-4 sm:flex">
          {RAIL.map((Icon, i) => (
            <span
              key={i}
              className={`relative flex h-10 items-center justify-center text-fg-2 ${i === active ? 'bg-lime-soft text-fg' : ''}`}
            >
              {i === active && <span className="absolute inset-y-2 left-0 w-1 rounded-r-sm bg-lime" />}
              <Icon size={20} strokeWidth={1.75} />
            </span>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5">
          <div className="truncate text-body font-medium">{title}</div>
          {children}
        </div>
      </div>
      {footer ?? <SampleCaption />}
    </div>
  )
}

export function MockTabs({ items }) {
  return (
    <div className="flex gap-4 text-small">
      {items.map(([label, count], i) => (
        <span key={label} className={i === 0 ? 'border-b-2 border-ink pb-1 text-fg' : 'pb-1 text-muted'}>
          {label} {count}
        </span>
      ))}
    </div>
  )
}

export function MockRows({ rows }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center gap-3 rounded-sm bg-bg p-3">
          <img src={r.avatar} alt="" width={40} height={40} className="hidden size-10 shrink-0 rounded-full sm:block" />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
            <span className="w-full truncate text-small text-fg">{r.name}</span>
            <span className="flex w-full flex-wrap justify-between gap-x-3 text-caption tabular-nums">
              <span className="text-fg">{r.detail}</span>
              <span className="text-muted">{r.when}</span>
            </span>
            <StatusBadge tone={r.tone}>{r.status}</StatusBadge>
          </div>
        </li>
      ))}
    </ul>
  )
}

function MiniSteps({ current }) {
  return (
    <ol className="flex items-center">
      {MILESTONES.map((name, i) => (
        <li key={name} className="flex flex-1 items-center last:flex-none">
          <span
            className={`size-4 shrink-0 rounded-full ${
              i < current ? 'bg-ink' : i === current ? 'bg-accent ring-2 ring-ink' : 'border border-border-strong bg-surface'
            }`}
          />
          {i < MILESTONES.length - 1 && <span className={`h-0.5 flex-1 ${i < current ? 'bg-ink' : 'bg-border'}`} />}
        </li>
      ))}
    </ol>
  )
}

function QuoteSplit() {
  return (
    <div>
      <p className="text-small text-muted">Quote total</p>
      <p className="tabular text-h3">{money(8500000)}</p>
      <div className="mt-3 flex h-3 gap-0.5">
        <div className="flex-[70] rounded-full bg-ink" />
        <div className="flex-[30] rounded-full bg-border-strong" />
      </div>
      <div className="mt-2 flex flex-col gap-1 text-caption text-fg-2 tabular-nums">
        <span>Deposit {money(5950000)} (70%)</span>
        <span>Balance {money(2550000)} (30%)</span>
      </div>
    </div>
  )
}

/* Hero tab panels: the real shell, one view per tab. They sit on a bg-surface-2 media panel. */

export function InspectionMock() {
  return (
    <AppWindow title="Requests">
      <MockTabs items={[['Needs you', 2], ['Waiting', 1]]} />
      <MockRows rows={[LIST_ROWS[1], LIST_ROWS[0]]} />
    </AppWindow>
  )
}

export function QuoteMock() {
  return (
    <AppWindow title={JOB}>
      <MiniSteps current={3} />
      <StatusBadge tone="clock" className="self-start">Quote sent</StatusBadge>
      <QuoteSplit />
    </AppWindow>
  )
}

export function StagesMock() {
  return (
    <AppWindow title={JOB}>
      <MiniSteps current={4} />
      <StatusBadge tone="booked" className="self-start">Repair booked</StatusBadge>
      <Rows rows={[
        ['Deposit (70%)', `${money(5950000)} recorded`],
        ['Repair window', wat(REPAIR_FROM)],
        ['Balance (30%)', money(2550000)],
      ]} />
    </AppWindow>
  )
}

export function HistoryMock() {
  return (
    <AppWindow title={`${JOB}: history`} active={0}>
      <ol>
        {HISTORY.map(([time, event]) => (
          <li key={event} className="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-border py-3 first:border-t-0 first:pt-0">
            <span className="text-small">{event}</span>
            <span className="text-small text-muted tabular-nums">{wat(time)}</span>
          </li>
        ))}
      </ol>
    </AppWindow>
  )
}

/* Small flat mock inside a stage card, on bg-surface-2. */

/* `compact` is the collapsed-card preview: a badge and the first two rows, caption size. */

export function MiniMock({ stage, compact = false }) {
  if (compact) {
    const badge = { Inspect: 'Inspection booked', Repair: 'Repair booked' }[stage]
    return (
      <div aria-hidden="true" className="rounded-lg bg-surface p-3 shadow-card">
        {badge && <StatusBadge tone="booked" className="mb-1">{badge}</StatusBadge>}
        <Rows rows={STAGE_ROWS[stage].slice(0, 2)} compact />
        <SampleCaption className="mt-1" />
      </div>
    )
  }
  return (
    <div aria-hidden="true" className="rounded-lg bg-surface p-4 shadow-card">
      {stage === 'Inspect' && <StatusBadge tone="booked" className="mb-2">Inspection booked</StatusBadge>}
      {stage === 'Repair' && <StatusBadge tone="booked" className="mb-2">Repair booked</StatusBadge>}
      {stage === 'Quote' && <div className="mb-2"><QuoteSplit /></div>}
      <Rows rows={STAGE_ROWS[stage]} />
      <SampleCaption className="mt-2" />
    </div>
  )
}


/* Artisan section mocks, stacked on the lemon-soft panel. One white block, no further nesting. */

function Block({ children }) {
  return <div className="rounded-lg bg-surface p-5 shadow-raised sm:p-6">{children}</div>
}

function Frame({ children }) {
  return (
    <div aria-hidden="true" className="flex size-full flex-col justify-center gap-3">
      {children}
      <SampleCaption className="self-start rounded-sm bg-surface/85 px-2 py-0.5" />
    </div>
  )
}

export function FeeMock() {
  return (
    <Frame>
      <Block>
        <Rows rows={[['Inspection fee', money(500000)], ['Quote total', money(8500000)]]} />
      </Block>
    </Frame>
  )
}

export function BookingMock() {
  const slots = [['9:00 am WAT', false], ['11:00 am WAT', true], ['2:00 pm WAT', false]]
  return (
    <Frame>
      <Block>
        {slots.map(([time, booked]) => (
          <div key={time} className="flex items-center justify-between gap-4 border-t border-border py-2 first:border-t-0">
            <span className={`text-small ${booked ? 'text-muted' : 'text-fg'}`}>{time}</span>
            {booked ? (
              <span className="flex items-center gap-1 text-small text-muted">
                <Lock size={14} strokeWidth={1.75} aria-hidden="true" /> Booked
              </span>
            ) : (
              <span className="text-small text-fg-2">Open</span>
            )}
          </div>
        ))}
      </Block>
    </Frame>
  )
}

export function RatingMock() {
  return (
    <Frame>
      <Block>
        <div className="flex gap-1" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Star key={i} size={24} strokeWidth={1.5} strokeLinejoin="round" className="fill-accent-hover text-accent-hover" />
          ))}
        </div>
        <p className="mt-3 text-small text-fg-2">Shown after your first completed job</p>
      </Block>
    </Frame>
  )
}

export function IncomingMock() {
  const requests = [['Faulty socket in a bedroom', 'Yaba, Lagos'], ['No hot water from the geyser', 'Lekki, Lagos']]
  return (
    <Frame>
      <Block>
        {requests.map(([job, place]) => (
          <div key={job} className="flex items-center justify-between gap-3 border-t border-border py-2 first:border-t-0">
            <div className="min-w-0">
              <p className="truncate text-small">{job}</p>
              <p className="text-caption text-muted">{place}</p>
            </div>
            <div className="flex shrink-0 gap-1" aria-hidden="true">
              <span className="rounded-sm bg-ink px-2 py-1 text-caption font-medium text-on-ink">Accept</span>
              <span className="rounded-sm border border-ink px-2 py-1 text-caption text-fg">Decline</span>
            </div>
          </div>
        ))}
      </Block>
    </Frame>
  )
}
