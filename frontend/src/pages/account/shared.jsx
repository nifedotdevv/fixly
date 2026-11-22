import { Link } from 'react-router'

import { LINK } from './helpers.js'

export function Section({ title, description, danger = false, children }) {
  return (
    <section
      aria-labelledby={`${title.replace(/\W+/g, '-').toLowerCase()}-title`}
      className={`grid gap-6 rounded-md border bg-surface p-4 sm:p-6 lg:grid-cols-[16rem_1fr] lg:gap-10 ${danger ? 'border-error' : 'border-border'}`}
    >
      <div className="flex flex-col gap-2">
        <h2 id={`${title.replace(/\W+/g, '-').toLowerCase()}-title`}>{title}</h2>
        {description && <p className="text-fg-2">{description}</p>}
      </div>
      <div className="flex max-w-md flex-col gap-4">{children}</div>
    </section>
  )
}

export function Notice({ tone = 'error', children }) {
  const bg = tone === 'error' ? 'bg-error-soft' : 'bg-success-soft'
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-sm p-3 text-fg ${bg}`}>
      {children}
    </div>
  )
}

export function LegacyNotice() {
  return (
    <Notice>
      <p>
        Reset your password using your email address before changing account credentials.{' '}
        <Link to="/forgot-password" className={LINK}>Reset your password</Link>
      </p>
    </Notice>
  )
}
