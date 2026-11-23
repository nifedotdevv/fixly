import { useState } from 'react'
import { StageSteps } from '../../components/progress/index.js'
import { Avatar, DataRow, StatusBadge } from '../../components/ui/index.js'
import { formatMoney } from '../../lib/money.js'
import { deadlineFor, deadlineLabel, statusMeta } from '../../lib/requestStatus.js'
import { formatRelative, formatDateTime } from '../../lib/time.js'

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

const SOON_MS = 24 * 3600000
const firstLine = (text = '') => text.split('\n')[0].trim()

export const ROW_COLUMNS = 'lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_8rem]'

export default function RequestRow({ view, role }) {
  const { name, avatar, role: otherRole } = otherParty(view, role)
  const { label, tone } = statusMeta(view.status)
  const deadline = deadlineFor(view)
  const money = moneyFor(view)
  const [now] = useState(Date.now)
  return (
    <DataRow
      to={`/requests/${view.id}`}
      columns={ROW_COLUMNS}
      className="flex-wrap items-start py-4 lg:flex-nowrap lg:items-center"
    >
      <DataRow.Cell className="order-1 flex flex-1 items-center gap-3 lg:flex-none">
        <Avatar src={avatar} role={otherRole} name={name} size={40} decorative />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium break-words">{name}</span>
          <span className="truncate text-fg-2">{firstLine(view.description)}</span>
        </span>
      </DataRow.Cell>
      <DataRow.Cell className="order-3 flex basis-full flex-col items-start gap-2 pl-[52px] lg:order-none lg:basis-auto lg:pl-0">
        <StatusBadge tone={tone}>{label}</StatusBadge>
        <span className="hidden sm:block">
          <StageSteps status={view.status} view={view} deadline={deadline} size="mini" />
        </span>
      </DataRow.Cell>
      <DataRow.Cell className="order-4 basis-full pl-[52px] text-small lg:order-none lg:basis-auto lg:pl-0">
        {deadline ? (
          <>
            <span className="block">{deadlineLabel(view.status)} {formatDateTime(deadline)}</span>
            <span className={`block ${new Date(deadline).getTime() - now < SOON_MS ? 'text-warning' : 'text-fg-2'}`}>
              {formatRelative(deadline)}
            </span>
          </>
        ) : (
          <span className="text-muted">No deadline</span>
        )}
      </DataRow.Cell>
      <DataRow.Cell numeric align="end" className="order-2 shrink-0 font-medium">
        {money ? formatMoney(money) : (
          <>
            <span aria-hidden="true">{'\u2014'}</span>
            <span className="sr-only">No amount</span>
          </>
        )}
      </DataRow.Cell>
    </DataRow>
  )
}
