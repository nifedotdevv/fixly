import { CONTROL, cn } from './cn.js'
import { fromLocalInput, zoneLabel } from '../../lib/time.js'

export default function DateTimeInput({ onChange, className, hideZone = false, ...props }) {
  return (
    <div className="flex flex-col gap-1">
      <input
        type="datetime-local"
        onChange={(e) => onChange?.(fromLocalInput(e.target.value) || null)}
        className={cn(CONTROL, 'tabular', className)}
        {...props}
      />
      {!hideZone && <p className="text-caption text-muted">Times are in {zoneLabel()}</p>}
    </div>
  )
}
