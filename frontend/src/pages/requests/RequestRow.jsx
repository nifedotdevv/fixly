import { Link } from 'react-router'
import { Tape } from '../../components/tape/index.js'
import { Avatar, StatusBadge } from '../../components/ui/index.js'
import { formatMoney } from '../../lib/money.js'
import { deadlineFor, statusMeta } from '../../lib/requestStatus.js'
import { formatRelative, formatTime } from '../../lib/time.js'

const FALLBACK_NAME = 'Former Fixly user'

function otherParty(view, role) {
  const side = role === 'artisan' ? 'homeowner' : 'artisan'
  const person = view.participants?.[side]
  return { name: person?.name || FALLBACK_NAME, avatar: person?.avatar?.url, role: side === 'artisan' ? 'artisan' : 'house_owner' }
}

// The money that matters at this stage: the quote once there is one, otherwise the inspection fee.
function moneyFor(view) {
  return view.quote?.total ?? view.inspectionFee ?? null
}

const firstLine = (text = '') => text.split('\n')[0].trim()

export default function RequestRow({ view, role }) {
  const { name, avatar, role: otherRole } = otherParty(view, role)
  const { label, tone } = statusMeta(view.status)
  const deadline = deadlineFor(view)
  const money = moneyFor(view)
  return (
    <li className="border-b border-border">
      <Link
        to={`/requests/${view.id}`}
        className="flex w-full items-start gap-3 py-4 hover:bg-surface-inset sm:gap-4 sm:px-2"
      >
        <Avatar src={avatar} role={otherRole} name={name} size={40} decorative />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium break-words">{name}</span>
          <span className="truncate text-fg-2">{firstLine(view.description)}</span>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusBadge tone={tone}>{label}</StatusBadge>
            <Tape status={view.status} view={view} deadline={deadline} size="mini" />
          </div>
          {deadline && (
            <span className="text-caption text-warning">
              Ends {formatTime(deadline)}, {formatRelative(deadline)}
            </span>
          )}
        </div>
        {money && <span className="tabular shrink-0 text-right font-medium">{formatMoney(money)}</span>}
      </Link>
    </li>
  )
}
