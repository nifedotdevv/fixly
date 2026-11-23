import { formatDateTime } from '../../../lib/time.js'

export default function SupportPanel({ view }) {
  const { problem } = view
  return (
    <section data-panel="support" aria-labelledby="panel-support" className="flex flex-col gap-3">
      <h2 id="panel-support">Support is reviewing</h2>
      <p className="max-w-[60ch] text-fg-2">
        Fixly support is reviewing this. Nothing is needed from you right now.
      </p>
      {problem && (
        <div className="flex flex-col gap-1">
          <p className="font-medium">Reported problem</p>
          <p className="max-w-[60ch] break-words whitespace-pre-line">{problem.explanation}</p>
          <p className="text-caption text-fg-2">Reported {formatDateTime(problem.reportedAt)}</p>
        </div>
      )}
    </section>
  )
}
