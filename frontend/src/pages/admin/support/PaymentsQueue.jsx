import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { Wallet } from 'lucide-react'
import {
  Button, ConfirmDialog, DataRow, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, Pagination, Panel, SkeletonRows,
  Textarea, useToast,
} from '../../../components/ui/index.js'
import { MOTION, cn } from '../../../components/ui/cn.js'
import { api } from '../../../lib/api.js'
import { formatMoney } from '../../../lib/money.js'
import { queryKeys } from '../../../lib/queryClient.js'
import { formatDateTime } from '../../../lib/time.js'
import { useDocumentTitle } from '../../../layouts/useDocumentTitle.js'
import { PAGE_SIZE, PURPOSE, byNeedsYou, excerpt, pageOf, refundStatus } from './format.js'

const COLUMNS = 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_7rem_7.5rem]'
const HEADS = ['Payment reference', 'Purpose', 'Reason', 'Refund', 'Created', 'Amount']

const TONE = {
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  error: 'bg-error-soft text-error',
  neutral: 'bg-surface-2 text-fg-2',
}

function RefundCell({ status }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={cn('inline-flex rounded-sm px-2 py-1 text-caption font-medium', TONE[status.tone])}>{status.label}</span>
      {status.detail && <span className="break-words text-caption text-fg-2">{status.detail}</span>}
    </div>
  )
}

const DISPOSITIONS = [
  { value: 'externally_refunded', label: 'Refunded outside Fixly', done: 'Marked as refunded outside Fixly' },
  { value: 'externally_settled', label: 'Settled outside Fixly', done: 'Marked as settled outside Fixly' },
]

function ResolvePayment({ payment }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()
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
      // The payment changed underneath (for example an automatic refund started): show its current state.
      // The refreshed row may no longer offer Resolve, closing this dialog, so the reason also goes in a toast.
      if (err.status === 409) {
        toast({ title: err.message, tone: 'neutral' })
        queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] })
      }
      throw err
    }
    finished.current = true
    setStep('closed')
    queryClient.invalidateQueries({ queryKey: ['admin', 'payments'] })
    toast({ title: chosen.done, tone: 'success' })
  }

  return (
    <>
      <Button variant="secondary" size="compact" onClick={() => setStep('form')}>Resolve</Button>
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
                <label key={d.value} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-border-strong px-3 py-2 has-[:focus-visible]:border-ink ${MOTION}`}>
                  <RadioGroup.Item
                    value={d.value}
                    className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-2 data-[state=checked]:border-ink"
                  >
                    <RadioGroup.Indicator className="size-2.5 rounded-full bg-ink" />
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
        description={`Marks ${formatMoney(payment)} as ${chosen ? chosen.label[0].toLowerCase() + chosen.label.slice(1) : ''}. This only records what you did elsewhere. It does not move money.`}
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
  // One clock per render keeps every row's status and the order consistent.
  const [now] = useState(Date.now)
  const rows = byNeedsYou(query.data?.data ?? [], now)
  const needsYou = rows.filter((p) => refundStatus(p, now).needsYou).length
  const totalPages = query.data?.meta?.totalPages ?? 1
  const problemIds = new Set(useQuery({
    queryKey: queryKeys.adminProblems({ page: 1, limit: 100 }),
    queryFn: ({ signal }) => api('/admin/support/requests', { query: { page: 1, limit: 100 }, signal }),
  }).data?.data?.map((r) => r._id))

  const total = query.data?.meta?.total ?? rows.length
  const summary = query.isSuccess
    // The "need you" count is only exact when every payment is on this page.
    ? `${total} ${total === 1 ? 'payment' : 'payments'} to reconcile${rows.length && rows.length === total ? `, ${needsYou} ${needsYou === 1 ? 'needs' : 'need'} you` : ''}`
    : ''

  let body
  if (query.isPending) body = <Panel flush><SkeletonRows compact count={6} /></Panel>
  else if (query.isError) {
    body = <Panel><ErrorState title="Couldn't load payments" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isFetching} /></Panel>
  } else if (!rows.length) body = <Panel flush><EmptyState icon={Wallet} message="No payments need reconciliation." /></Panel>
  else {
    body = (
      <>
        <Panel flush>
          <div
            aria-hidden="true"
            className={`hidden border-b border-border px-6 py-2 text-caption text-muted lg:grid lg:gap-4 ${COLUMNS}`}
          >
            {HEADS.map((h, i) => <span key={h} className={i === HEADS.length - 1 ? 'text-right' : undefined}>{h}</span>)}
            <span />
          </div>
          <ul aria-label="Payments to reconcile">
            {rows.map((p) => (
              <DataRow compact as="div" key={p._id} columns={COLUMNS} className="flex-wrap lg:gap-4">
                <DataRow.Cell className="order-1 flex-1 lg:flex-none">
                  <span className="tabular block break-all font-medium">{p._id}</span>
                  {problemIds.has(p.requestId) && (
                    <Link
                      to={`/admin/support/problems/${p.requestId}`}
                      aria-label={`View problem for payment ${p._id}`}
                      className="link text-caption"
                    >
                      View problem
                    </Link>
                  )}
                </DataRow.Cell>
                <DataRow.Cell className="order-3 basis-full text-fg-2 lg:order-none lg:basis-auto lg:text-fg">{PURPOSE[p.purpose] ?? p.purpose}</DataRow.Cell>
                <DataRow.Cell className="order-4 basis-full break-words text-fg-2 lg:order-none lg:basis-auto lg:text-fg">
                  {/* Full on phones, where rows stack; shortened in the desktop table, with the full text on hover. */}
                  <span className="lg:hidden">{p.reason}</span>
                  <span className="hidden lg:inline" title={p.reason}>{excerpt(p.reason, 70)}</span>
                </DataRow.Cell>
                <DataRow.Cell className="order-5 basis-full lg:order-none lg:basis-auto"><RefundCell status={refundStatus(p, now)} /></DataRow.Cell>
                <DataRow.Cell numeric className="order-6 basis-full text-fg-2 lg:order-none lg:basis-auto lg:text-fg">{formatDateTime(p.createdAt)}</DataRow.Cell>
                <DataRow.Cell numeric align="end" className="order-2 shrink-0 font-medium">{formatMoney(p)}</DataRow.Cell>
                <DataRow.Cell className="order-7 flex justify-end lg:order-none">
                  {refundStatus(p, now).needsYou
                    ? <ResolvePayment payment={p} />
                    : <span className="text-caption text-fg-2">No action needed</span>}
                </DataRow.Cell>
              </DataRow>
            ))}
          </ul>
        </Panel>
        {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={(n) => setSp({ page: String(n) })} />}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Payments" summary={summary} className="mb-0! lg:mb-0!" />
      {body}
    </div>
  )
}
