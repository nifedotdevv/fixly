import { useEffect, useRef, useState } from 'react'
import { MailWarning } from 'lucide-react'
import { Button, useToast } from '../components/ui/index.js'
import { useAuth } from '../auth/useAuth.js'
import { api, ApiError } from '../lib/api.js'

const COOLDOWN_MS = 60_000

function resendError(err) {
  if (err instanceof ApiError && err.status === 429) return 'Too many attempts. Try again in 15 minutes.'
  if (err instanceof ApiError && err.status === 503) return "Email isn't set up on this server."
  return err instanceof ApiError ? err.message : "Couldn't send the link. Try again."
}

function useResend(email) {
  const { toast } = useToast()
  const [pending, setPending] = useState(false)
  const [cooling, setCooling] = useState(false)
  const [error, setError] = useState('')
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const resend = async () => {
    setPending(true)
    setError('')
    try {
      await api('/auth/resend-verification', { method: 'POST', body: {} })
      toast({ title: `Link sent to ${email}`, tone: 'success' })
      setCooling(true)
      timer.current = setTimeout(() => setCooling(false), COOLDOWN_MS)
    } catch (err) {
      setError(resendError(err))
    } finally {
      setPending(false)
    }
  }
  return { resend, pending, cooling, error }
}

function Body({ email, className }) {
  const { resend, pending, cooling, error } = useResend(email)
  return (
    <div className={className}>
      <div className="flex min-w-0 items-start gap-3">
        <MailWarning size={20} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-info" />
        <p className="min-w-0 break-words text-fg">
          Verify your email to send requests and appear in the directory. We sent a link to {email}.
          {error && <span className="mt-1 block text-error">{error}</span>}
        </p>
      </div>
      <Button variant="secondary" loading={pending} disabled={cooling} onClick={resend} className="shrink-0 self-start sm:self-center">
        {cooling ? 'Sent' : 'Resend link'}
      </Button>
    </div>
  )
}

const layout = 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6'

// Inline panel for forms to show on a 403 EMAIL_NOT_VERIFIED.
export function VerifyNotice({ email }) {
  return (
    <div role="status" className="rounded-md bg-info-soft p-4">
      <Body email={email} className={layout} />
    </div>
  )
}

export default function VerifyBanner({ maxWidth = 'max-w-6xl' }) {
  const { me } = useAuth()
  if (me?.emailVerified !== false) return null
  return (
    <div role="status" className="bg-info-soft">
      <Body email={me.email} className={`mx-auto w-full ${maxWidth} px-4 py-3 sm:px-8 ${layout}`} />
    </div>
  )
}
