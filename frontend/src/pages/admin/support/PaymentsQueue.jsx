import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { Button, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Pagination, Textarea, useToast } from '../../../components/ui/index.js'
import { MOTION } from '../../../components/ui/cn.js'
import { api } from '../../../lib/api.js'
import { formatMoney } from '../../../lib/money.js'
import { queryKeys } from '../../../lib/queryClient.js'
import { formatDateTime } from '../../../lib/time.js'
import { useDocumentTitle } from '../../../layouts/useDocumentTitle.js'
import { SupportNav, TableSkeleton } from './shared.jsx'
import { PAGE_SIZE, PURPOSE, TD, TH, pageOf } from './format.js'

const DISPOSITIONS = [
  { value: 'externally_refunded', label: 'Refunded outside Fixly', done: 'Marked as refunded outside Fixly' },
  { value: 'externally_settled', label: 'Settled outside Fixly', done: 'Marked as settled outside Fixly' },
]

function ResolvePayment({ payment }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [step, setStep] = useState('closed')
  const [disposition, setDisposition] = useState('')
  const [note, setNote] = useState('')
  const [reference, setReference] = useState('')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const finished = useRef(false)
  const chosen = DISPOSITIONS.find((d) => d.value === disposition)

  const mutation = useMutation({
    mutationFn: (body) => api('/admin/support/payments/resolve', { method: 'POST', body }),
  })

  function review(e) {
    e.preventDefault()
    const next = {}
    if (!disposition) next.disposition = 'Choose how the money was handled.'
    if (!note.trim()) next.note = 'Add a note for the record.'
    if (!reference.trim()) next.reference = 'Add your ticket or call reference.'
    setErrors(next)
    if (Object.keys(next).length) return
    setServerError('')
    finished.current = false
    setStep('confirm')
  }

  async function confirm() {
    try {
      await mutation.mutateAsync({
        paymentReference: payment._id,
        disposition,
        note: note.trim(),
        resolutionReference: reference.trim(),
      })
    } catch (err) {
      setServerError(err.message)
      throw err
    }
    finished.current = true
    setStep('closed')
    queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] })
    toast({ title: chosen.done, tone: 'success' })
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setStep('form')}>Resolve</Button>
      <Dialog
        open={step === 'form'}
        onOpenChange={(o) => setStep(o ? 'form' : 'closed')}
        title="Resolve payment"
        description="Record how this payment was handled outside Fixly. This does not move money."
      >
        <form onSubmit={review} noValidate className="flex flex-col gap-4">
          <Field label="Payment reference">
            <Input value={payment._id} readOnly />
          </Field>
          <div className="flex flex-col gap-2">
            <span id={`disp-${payment._id}`} className="font-medium text-fg">How it was handled</span>
            <RadioGroup.Root aria-labelledby={`disp-${payment._id}`} value={disposition} onValueChange={setDisposition} className="flex flex-col gap-2">
              {DISPOSITIONS.map((d) => (
                <label key={d.value} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-border-strong px-3 py-2 has-[:focus-visible]:border-accent ${MOTION}`}>
                  <RadioGroup.Item
                    value={d.value}
                    className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-inset data-[state=checked]:border-accent"
                  >
                    <RadioGroup.Indicator className="size-2.5 rounded-full bg-accent" />
                  </RadioGroup.Item>
                  {d.label}
                </label>
              ))}
            </RadioGroup.Root>
            {errors.disposition && <p role="alert" className="text-caption text-error">{errors.disposition}</p>}
          </div>
          <Field label="Note" helper="Kept on the payment record." error={errors.note}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
          </Field>
          <Field label="Resolution reference" helper="Your ticket or call reference" error={errors.reference}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} autoComplete="off" />
          </Field>
          <div>
            <Button type="submit">Review resolution</Button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={step === 'confirm'}
        onOpenChange={(o) => { if (!o && !finished.current) setStep('form') }}
        tone="primary"
        title="Record this resolution?"
        description={`Marks ${formatMoney(payment)} as ${chosen?.label.toLowerCase() ?? ''}. This only records what you did elsewhere. It does not move money.`}
        confirmLabel="Record resolution"
        loadingLabel="Saving…"
        onConfirm={confirm}
        error={serverError}
      />
    </>
  )
}

export default function PaymentsQueue() {
  useDocumentTitle('Payments to reconcile')
  const [sp, setSp] = useSearchParams()
  const page = pageOf(sp)
  const params = { page, limit: PAGE_SIZE }
  const query = useQuery({
    queryKey: queryKeys.adminPayments(params),
    queryFn: ({ signal }) => api('/admin/support/payments', { query: params, signal }),
  })
  const rows = query.data?.data ?? []
  const totalPages = query.data?.meta?.totalPages ?? 1
  const problemIds = new Set(useQuery({
    queryKey: queryKeys.adminProblems({ page: 1, limit: 100 }),
    queryFn: ({ signal }) => api('/admin/support/requests', { query: { page: 1, limit: 100 }, signal }),
  }).data?.data?.map((r) => r._id))

  let body
  if (query.isPending) body = <TableSkeleton />
  else if (query.isError) {
    body = <ErrorState title="Couldn't load payments" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isFetching} />
  } else if (!rows.length) body = <EmptyState message="No payments need reconciliation." />
  else {
    body = (
      <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] border-collapse">
            <caption className="sr-only">Payments that need reconciliation, newest first</caption>
            <thead>
              <tr className="border-b border-border-strong">
                <th scope="col" className={TH}>Payment reference</th>
                <th scope="col" className={TH}>Request</th>
                <th scope="col" className={TH}>Purpose</th>
                <th scope="col" className={TH}>Amount</th>
                <th scope="col" className={TH}>Reason</th>
                <th scope="col" className={TH}>Created</th>
                <th scope="col" className={TH}><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p._id} className="border-b border-border">
                  <td className={`${TD} tabular break-all`}>{p._id}</td>
                  <td className={`${TD} tabular break-all`}>
                    {problemIds.has(p.requestId)
                      ? <Link to={`/admin/support/problems/${p.requestId}`} className="underline underline-offset-2 hover:text-accent">{p.requestId}</Link>
                      : p.requestId}
                  </td>
                  <td className={TD}>{PURPOSE[p.purpose] ?? p.purpose}</td>
                  <td className={`${TD} tabular whitespace-nowrap`}>{formatMoney(p)}</td>
                  <td className={`${TD} max-w-[18rem] break-words`}>{p.reason}</td>
                  <td className={`${TD} tabular whitespace-nowrap`}>{formatDateTime(p.createdAt)}</td>
                  <td className={TD}><ResolvePayment payment={p} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="mt-6">
            <Pagination page={page} totalPages={totalPages} onChange={(n) => setSp({ page: String(n) })} />
          </div>
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6 py-6">
      <h1>Support</h1>
      <SupportNav />
      <div aria-live="polite" className="min-w-0">{body}</div>
    </div>
  )
}
