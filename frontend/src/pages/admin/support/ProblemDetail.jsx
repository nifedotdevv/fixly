import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { ArrowLeft } from 'lucide-react'
import {
  Button, ConfirmDialog, ErrorState, Field, Input, LinkButton, PageHeader, Panel, Skeleton, SkeletonPanel, StatusBadge, Textarea,
  useToast,
} from '../../../components/ui/index.js'
import { MOTION } from '../../../components/ui/cn.js'
import { StageSteps } from '../../../components/progress/index.js'
import { ApiError, api } from '../../../lib/api.js'
import { formatMoney } from '../../../lib/money.js'
import { queryKeys } from '../../../lib/queryClient.js'
import { statusMeta } from '../../../lib/requestStatus.js'
import { formatDateTime } from '../../../lib/time.js'
import { useDocumentTitle } from '../../../layouts/useDocumentTitle.js'
import { PURPOSE } from './format.js'

const HEADER = 'mb-0! lg:mb-0!'
const BACK = (
  <LinkButton to="/admin/support/problems" variant="tertiary">
    <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
    Back to problems
  </LinkButton>
)

const DISPOSITIONS = [
  { value: 'resume_confirmation', label: 'Return to homeowner confirmation', effect: 'The homeowner can confirm the repair or report again.' },
  { value: 'close', label: 'Close the job', effect: 'Ends the job as closed by support. This does not record a payment or refund.' },
]
const DISPOSITION_LABEL = { resume_confirmation: 'Returned to homeowner confirmation', close: 'Closed the job' }

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-caption text-fg-2">{label}</dt>
      <dd className="tabular break-words">{children}</dd>
    </div>
  )
}

const windowText = (w) => `${formatDateTime(w.start)} to ${formatDateTime(w.end)}`
const money = (amount, currency) => formatMoney({ amount, currency })

function Facts({ r }) {
  const currency = r.quote?.total?.currency
  return (
    <dl className="flex flex-col gap-4">
      <Row label="Description"><span className="whitespace-pre-line">{r.description}</span></Row>
      <Row label="Service address"><span className="whitespace-pre-line">{r.serviceAddress}</span></Row>
      {r.inspectionWindow && <Row label="Inspection window">{windowText(r.inspectionWindow)}</Row>}
      {r.quote?.window && <Row label="Repair window">{windowText(r.quote.window)}</Row>}
      {r.inspectionFee && <Row label="Inspection fee">{formatMoney(r.inspectionFee)}</Row>}
      {r.quote && (
        <>
          <Row label="Quote total">{formatMoney(r.quote.total)}</Row>
          <Row label="Deposit">{money(r.quote.depositAmount, currency)}</Row>
          <Row label="Balance">{money(r.quote.balanceAmount, currency)}</Row>
        </>
      )}
      <Row label="Verified payments">
        {r.verifiedPayments?.length ? (
          <ul className="flex flex-col gap-2">
            {r.verifiedPayments.map((p, i) => (
              <li key={`${p.externalReference}-${i}`} className="flex flex-col">
                <span>{PURPOSE[p.purpose] ?? p.purpose}: {money(p.amount, p.currency)}</span>
                <span className="text-caption text-fg-2">{p.externalReference}, {formatDateTime(p.recordedAt)}</span>
              </li>
            ))}
          </ul>
        ) : 'None recorded'}
      </Row>
    </dl>
  )
}

function History({ items }) {
  if (!items?.length) return null
  return (
    <Panel title="Earlier resolutions">
      <ul className="flex flex-col">
        {items.map((s, i) => (
          <li key={i} className="flex flex-col gap-1 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0">
            <p className="font-medium">{DISPOSITION_LABEL[s.disposition] ?? s.disposition}</p>
            <p className="tabular text-caption text-fg-2">
              Resolved {formatDateTime(s.resolvedAt)} for the problem reported {formatDateTime(s.problemReportedAt)}
            </p>
            <p className="whitespace-pre-line">{s.note}</p>
            {s.resolutionReference && <p className="text-caption text-fg-2">Reference: {s.resolutionReference}</p>}
            <p className="whitespace-pre-line text-caption text-fg-2">Problem then: {s.problemExplanation}</p>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function ResolveForm({ id, problem }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [disposition, setDisposition] = useState('')
  const [note, setNote] = useState('')
  const [reference, setReference] = useState('')
  const [errors, setErrors] = useState({})
  const [open, setOpen] = useState(false)
  const [serverError, setServerError] = useState('')
  const closing = disposition === 'close'
  const effect = DISPOSITIONS.find((d) => d.value === disposition)?.effect

  const mutation = useMutation({
    mutationFn: (body) => api(`/admin/support/requests/${id}/resolve`, { method: 'POST', body }),
  })

  function review(e) {
    e.preventDefault()
    const next = {}
    if (!disposition) next.disposition = 'Choose what happens next.'
    if (!note.trim()) next.note = 'Add a note for the record.'
    if (closing && !reference.trim()) next.reference = 'Add your ticket or call reference to close the job.'
    setErrors(next)
    if (Object.keys(next).length) return
    setServerError('')
    setOpen(true)
  }

  async function confirm() {
    const body = {
      disposition,
      note: note.trim(),
      problemReportedAt: new Date(problem.reportedAt).toISOString(),
    }
    if (reference.trim()) body.resolutionReference = reference.trim()
    try {
      await mutation.mutateAsync(body)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setServerError(err.message)
        queryClient.invalidateQueries({ queryKey: queryKeys.adminProblem(id) })
      } else {
        setServerError(err.message)
      }
      throw err
    }
    queryClient.invalidateQueries({ queryKey: ['admin', 'problems'] })
    queryClient.invalidateQueries({ queryKey: queryKeys.adminProblem(id) })
    toast({ title: closing ? 'Job closed' : 'Returned to homeowner confirmation', tone: 'success' })
    navigate('/admin/support/problems')
  }

  return (
    <form onSubmit={review} noValidate className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span id="disposition-label" className="font-medium text-fg">What happens next</span>
        <RadioGroup.Root
          aria-labelledby="disposition-label"
          value={disposition}
          onValueChange={setDisposition}
          className="flex flex-col gap-2"
        >
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
      <Field label="Note" helper="Kept on the job record." error={errors.note}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </Field>
      <Field
        label={closing ? 'Resolution reference' : 'Resolution reference (optional)'}
        helper="Your ticket or call reference"
        error={errors.reference}
      >
        <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} autoComplete="off" />
      </Field>
      <p className="text-caption text-fg-2">
        Resolving the problem reported <span className="tabular">{formatDateTime(problem.reportedAt)}</span>.
      </p>
      <div>
        <Button type="submit">Review resolution</Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        tone={closing ? 'destructive' : 'primary'}
        title={closing ? 'Close this job?' : 'Return to homeowner confirmation?'}
        description={effect}
        confirmLabel={closing ? 'Close the job' : 'Return to homeowner'}
        loadingLabel="Saving…"
        onConfirm={confirm}
        error={serverError}
      />
    </form>
  )
}

export default function ProblemDetail() {
  useDocumentTitle('Reported problem')
  const { id } = useParams()
  const query = useQuery({
    queryKey: queryKeys.adminProblem(id),
    queryFn: ({ signal }) => api(`/admin/support/requests/${id}`, { signal }),
  })
  const r = query.data?.data

  let badge = null
  let body
  if (query.isPending) {
    body = (
      <div role="status" aria-label="Loading problem" className="flex flex-col gap-6">
        <Panel><Skeleton className="h-12 w-full" /></Panel>
        <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
          <Panel className="lg:col-span-8"><SkeletonPanel lines={4} /></Panel>
          <Panel className="lg:col-span-4"><SkeletonPanel lines={6} /></Panel>
        </div>
      </div>
    )
  } else if (query.isError) {
    body = <Panel><ErrorState title="Couldn't load this problem" message={query.error.message} onRetry={() => query.refetch()} retrying={query.isFetching} /></Panel>
  } else {
    const { label, tone } = statusMeta(r.status)
    const waiting = r.status === 'problem_reported' && r.problem
    badge = <div className="mt-3"><StatusBadge tone={tone}>{label}</StatusBadge></div>
    body = (
      <>
        <Panel aria-label="Progress">
          <StageSteps status={r.status} view={r} />
        </Panel>
        <div className="grid gap-6 lg:grid-cols-12 lg:gap-x-8">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
            {r.problem && (
              <Panel title="What the homeowner reported">
                <p className="tabular mb-2 text-caption text-fg-2">Reported {formatDateTime(r.problem.reportedAt)}</p>
                <p className="max-w-[70ch] whitespace-pre-line">{r.problem.explanation}</p>
              </Panel>
            )}
            <Panel title={waiting ? 'Resolve this problem' : undefined}>
              {waiting
                ? <ResolveForm id={id} problem={r.problem} />
                : <p className="text-fg-2">This job has no open problem to resolve.</p>}
            </Panel>
            <History items={r.supportResolutions} />
          </div>
          <Panel as="aside" aria-label="Booking facts" title="Details" className="self-start lg:sticky lg:top-6 lg:col-span-4">
            <Facts r={r} />
          </Panel>
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reported problem" actions={BACK} className={HEADER}>
        {badge}
      </PageHeader>
      {body}
    </div>
  )
}
