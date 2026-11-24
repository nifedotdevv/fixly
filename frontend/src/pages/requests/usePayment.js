import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/ui/index.js'
import { api } from '../../lib/api.js'
import { openCheckout } from '../../lib/paystack.js'
import { queryKeys } from '../../lib/queryClient.js'

// If Paystack's checkout has not shown within this time (blocked or very slow network), stop waiting
// so the homeowner can try again. A later success or close is still checked with the server.
export const LOAD_TIMEOUT_MS = 20000

// Paystack statuses that may still turn into a payment (bank transfer, USSD and similar).
const STILL_PROCESSING = ['ongoing', 'pending', 'processing', 'queued']

// Homeowner checkout for request `id`.
//   phase: idle | starting | open | confirming | pending | refunding | error
//   pay()          starts (or resumes) the checkout and opens the Paystack popup
//   checkAgain()   asks the server about the last checkout again
//   dismiss()      clears a refund notice
// The browser never says whether a payment worked: after the popup closes the server asks Paystack.
const LOAD_FAILED = { phase: 'error', message: 'Paystack checkout couldn’t open. Check your connection and try again.' }
const NOT_PAID = { phase: 'error', message: 'The payment didn’t go through, and nothing was taken. You can try again.' }

export function usePayment(id) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [state, setState] = useState({ phase: 'idle' })
  const loadTimer = useRef()
  const closeCheckout = useRef()
  const stopWaiting = () => clearTimeout(loadTimer.current)
  useEffect(() => stopWaiting, [])

  const refresh = useCallback((request) => {
    if (request) queryClient.setQueryData(queryKeys.request(id), (old) => ({ ...old, data: request }))
    else queryClient.refetchQueries({ queryKey: queryKeys.request(id), exact: true })
    queryClient.invalidateQueries({ queryKey: ['requests'] })
  }, [id, queryClient])

  // `otherwise` is what to show when Paystack says nothing was paid.
  const check = useCallback(async (reference, { otherwise = NOT_PAID } = {}) => {
    stopWaiting()
    setState({ phase: 'confirming', reference })
    try {
      const { data } = await api(`/service-requests/${id}/payments/${reference}/verify`, { method: 'POST', body: {} })
      if (data.outcome === 'applied') {
        refresh(data.request)
        toast({ title: 'Payment received', tone: 'success' })
        setState({ phase: 'idle' })
      } else if (data.outcome === 'reconciliation_required') {
        refresh(data.request)
        setState({ phase: 'refunding' })
      } else if (STILL_PROCESSING.includes(data.status)) {
        setState({ phase: 'pending', reference })
      } else {
        setState(otherwise)
      }
    } catch {
      setState({ phase: 'error', reference, message: 'We couldn’t confirm your payment yet. If you paid, it will show here shortly.' })
    }
  }, [id, refresh, toast])

  const pay = useCallback(async () => {
    setState({ phase: 'starting' })
    let checkout
    try {
      ;({ data: checkout } = await api(`/service-requests/${id}/payments`, { method: 'POST', body: {} }))
    } catch (error) {
      // The stage moved on (already paid, expired, or about to): show the request as it is now.
      if (error.status === 409) refresh()
      setState({ phase: 'error', message: error.message })
      return
    }
    setState({ phase: 'open', reference: checkout.reference })
    let gaveUp = false
    const failed = () => {
      stopWaiting()
      setState(LOAD_FAILED)
    }
    // Paystack's loading overlay covers the page, so close it too, or the homeowner cannot try again.
    const giveUp = () => {
      gaveUp = true
      failed()
      closeCheckout.current?.()
    }
    stopWaiting()
    loadTimer.current = setTimeout(giveUp, LOAD_TIMEOUT_MS)
    try {
      closeCheckout.current = await openCheckout(checkout.accessCode, {
        onLoad: stopWaiting,
        // Our own reference, never the popup's: the server only settles checkouts it started.
        onSuccess: () => check(checkout.reference),
        // Closing the popup right after paying still counts, so always ask the server.
        // Closing the popup is not an error; after giving up on loading, keep saying why.
        onCancel: () => check(checkout.reference, { otherwise: gaveUp ? LOAD_FAILED : { phase: 'idle' } }),
        onError: failed,
      })
    } catch {
      failed()
    }
  }, [id, check, refresh])

  const checkAgain = useCallback(() => state.reference && check(state.reference), [check, state.reference])
  const dismiss = useCallback(() => setState({ phase: 'idle' }), [])

  return { ...state, pay, checkAgain, dismiss, busy: ['starting', 'open', 'confirming'].includes(state.phase) }
}
