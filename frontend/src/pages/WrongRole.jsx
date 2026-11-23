import { LinkButton } from '../components/ui/index.js'
import { useDocumentTitle } from '../layouts/useDocumentTitle.js'
import { ROLE_AUDIENCE } from '../auth/roles.js'

export default function WrongRole({ roles }) {
  useDocumentTitle('No access')
  const audience = roles.map((r) => ROLE_AUDIENCE[r]).join(' and ')
  return (
    <div className="flex flex-col items-start gap-4 py-8">
      <h1>This area is for {audience}</h1>
      <p className="max-w-[60ch] text-fg-2">Your account doesn’t have access to this page.</p>
      <LinkButton to="/dashboard">Go to your dashboard</LinkButton>
    </div>
  )
}
