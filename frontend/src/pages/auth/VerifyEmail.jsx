import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api.js'
import { queryKeys } from '../../lib/queryClient.js'
import { useAuth } from '../../auth/useAuth.js'
import { Button, LinkButton, useToast } from '../../components/ui/index.js'
import useFragmentToken from './useFragmentToken.js'

const INVALID = 'This link is invalid or has expired'

export default function VerifyEmail() {
  const token = useFragmentToken()
  const { me } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const started = useRef(false)
  const [result, setResult] = useState(null)
  const [resending, setResending] = useState(false)
  const signedIn = Boolean(me)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    api('/auth/verify-email', { method: 'POST', body: { token }, auth: false })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.me() })
        setResult({ ok: true })
      })
      .catch((err) => setResult({ ok: false, message: err.status === 400 ? INVALID : err.message }))
  }, [token, queryClient])

  const resend = async () => {
    setResending(true)
    try {
      await api('/auth/resend-verification', { method: 'POST', body: {} })
      toast({ title: `Link sent to ${me.email}`, tone: 'success' })
    } catch (err) {
      toast({ title: err.message, tone: 'error' })
    } finally {
      setResending(false)
    }
  }

  const outcome = token === null ? { ok: false, message: INVALID } : result
  return (
    <div className="flex max-w-[60ch] flex-col items-start gap-4 py-8">
      {!outcome && <h1 aria-live="polite">Verifying your email</h1>}
      {outcome?.ok && (
        <>
          <h1>Email verified</h1>
          <p className="text-fg-2">Your address is confirmed.</p>
          <LinkButton to={signedIn ? '/dashboard' : '/login'}>Continue</LinkButton>
        </>
      )}
      {outcome && !outcome.ok && (
        <>
          <h1>{outcome.message}</h1>
          <p className="text-fg-2">Verification links stop working after a while or once used.</p>
          {signedIn ? (
            <Button onClick={resend} loading={resending} loadingLabel="Sending…">Send a new link</Button>
          ) : (
            <LinkButton to="/login">Sign in</LinkButton>
          )}
        </>
      )}
    </div>
  )
}
