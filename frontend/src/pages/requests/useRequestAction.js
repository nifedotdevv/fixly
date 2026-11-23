import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../components/ui/index.js'
import { api, ApiError } from '../../lib/api.js'
import { queryKeys } from '../../lib/queryClient.js'

// Action label (from actionsFor) to the past-tense line the toast shows.
const DONE = {
  'Add note': 'Note added',
  'Cancel request': 'Request cancelled',
  'Accept with inspection fee': 'Request accepted',
  'Decline with reason': 'Request declined',
  'Mark inspection done': 'Inspection marked done',
  'Send quote': 'Quote sent',
  'Approve quote': 'Quote approved',
  'Decline quote': 'Quote declined',
  'Start repair': 'Repair started',
  'Report repair finished': 'Repair reported finished',
  'Confirm repair is finished': 'Repair confirmed as finished',
  'Report a problem': 'Problem reported',
  'Leave a review': 'Review posted',
}

export const doneMessage = (label) => DONE[label] ?? `${label}: done`

// Runs one action from actionsFor() against request `id`.
//   mutateAsync({ action, body }) resolves with the updated request view; 409s resolve to undefined
//   after a refetch, so callers can close their dialog and let the refreshed page speak.
// Extra fields on the returned mutation:
//   conflict  true after a 409 (the page shows ConflictNotice); cleared by the next attempt
//   errors    server messages from a 400, for forms
export function useRequestAction(id) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [conflict, setConflict] = useState(false)

  const mutation = useMutation({
    mutationFn: async ({ action, body }) => {
      try {
        const { data } = await api(action.endpoint, { method: 'POST', body })
        return data
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          setConflict(true)
          queryClient.refetchQueries({ queryKey: queryKeys.request(id), exact: true })
          return undefined
        }
        throw error
      }
    },
    onMutate: () => setConflict(false),
    onSuccess: (data, { action }) => {
      if (!data) return
      // The detail query caches the api() envelope, so keep that shape.
      queryClient.setQueryData(queryKeys.request(id), (old) => ({ ...old, data }))
      queryClient.invalidateQueries({ queryKey: ['requests'] })
      toast({ title: doneMessage(action.label), tone: 'success' })
    },
  })

  const error = mutation.error
  const errors = error instanceof ApiError && error.status === 400 ? error.errors : []
  return { ...mutation, conflict, errors }
}
