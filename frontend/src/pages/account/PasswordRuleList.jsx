import { Check, Circle, CircleAlert } from 'lucide-react'
import { RULES } from './passwordRules.js'

/** Live checklist under a new-password field. Limit rules appear only when broken. */
export default function PasswordRuleList({ password }) {
  return (
    <ul aria-label="Password rules" className="flex flex-col gap-1 text-caption">
      {RULES.map((r) => {
        const ok = r.ok(password)
        if (r.limit && ok) return null
        const Icon = r.limit ? CircleAlert : ok ? Check : Circle
        const tone = r.limit ? 'text-error' : ok ? 'text-success' : 'text-muted'
        return (
          <li key={r.id} className={`flex items-center gap-2 ${tone}`}>
            <Icon size={14} strokeWidth={2} aria-hidden="true" />
            {r.label}
            {!r.limit && <span className="sr-only">{ok ? ' (met)' : ' (not met)'}</span>}
          </li>
        )
      })}
    </ul>
  )
}
