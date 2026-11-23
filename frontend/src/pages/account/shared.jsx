import { Link } from 'react-router'
import { TriangleAlert } from 'lucide-react'

import { Panel } from '../../components/ui/index.js'
import { LINK, sectionId } from './helpers.js'

export function Section({ title, description, danger = false, children }) {
  const heading = danger ? (
    <span className="flex items-center gap-2">
      <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-fg-2" />
      {title}
    </span>
  ) : title
  const desc = danger && description
    ? <span className="inline-block rounded-sm bg-error-soft px-2 py-0.5 text-fg">{description}</span>
    : description
  return (
    <Panel id={sectionId(title)} title={heading} description={desc} className="scroll-mt-6">
      {children}
    </Panel>
  )
}

// Fields column, kept to a readable width while the panel spans the page.
export function Fields({ children }) {
  return <div className="flex max-w-md flex-col gap-4">{children}</div>
}

export function SectionFooter({ children }) {
  return <div className="mt-6 flex justify-start border-t border-border pt-4 sm:justify-end">{children}</div>
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
