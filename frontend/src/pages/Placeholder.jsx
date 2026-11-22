import { LinkButton } from '../components/ui/index.js'
import { useDocumentTitle } from '../layouts/useDocumentTitle.js'

export default function Placeholder({ title }) {
  useDocumentTitle(title)
  return (
    <div className="flex flex-col items-start gap-2 py-8">
      <h1>{title}</h1>
      <p className="text-fg-2">This page is being built.</p>
      <LinkButton to="/dashboard" variant="tertiary">Back to your dashboard</LinkButton>
    </div>
  )
}
