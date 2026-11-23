import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api.js'
import { clearSession } from '../../lib/session.js'
import { LinkButton } from '../../components/ui/index.js'
import useFragmentToken from './useFragmentToken.js'

const INVALID = 'This link is invalid or has expired'

export default function ConfirmEmailChange() {
  const token = useFragmentToken()
  const started = useRef(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    api('/auth/confirm-email-change', { method: 'POST', body: { token }, auth: false })
      .then(() => {
        clearSession()
        setResult({ ok: true })
      })
      .catch((err) => {
        const message = err.status === 409 ? 'That email address is already in use.' : err.status === 400 ? INVALID : err.message
        setResult({ ok: false, message })
      })
  }, [token])

  const outcome = token === null ? { ok: false, message: INVALID } : result
  return (
    <div className="flex max-w-[60ch] flex-col items-start gap-4 py-8">
      {!outcome && <h1 aria-live="polite">Confirming your new email</h1>}
      {outcome?.ok && (
        <>
          <h1>Email changed. Sign in with your new address.</h1>
          <LinkButton to="/login">Sign in</LinkButton>
        </>
      )}
      {outcome && !outcome.ok && (
        <>
          <h1>{outcome.message}</h1>
          <LinkButton variant="secondary" to="/account">Go to account settings</LinkButton>
        </>
      )}
    </div>
  )
}
