import { LinkButton } from '../components/ui/index.js'
import { useDocumentTitle } from '../layouts/useDocumentTitle.js'

export default function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <div className="flex flex-col items-start gap-4 py-8">
      <h1>This page doesn’t exist</h1>
      <p className="max-w-[60ch] text-fg-2">The address may be mistyped, or the page has moved.</p>
      <LinkButton to="/">Go to the home page</LinkButton>
    </div>
  )
}
