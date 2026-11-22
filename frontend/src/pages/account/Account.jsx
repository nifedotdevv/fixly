import { Skeleton } from '../../components/ui/index.js'
import { useAuth } from '../../auth/useAuth.js'
import ProfileSection from './ProfileSection.jsx'
import PhotoSection from './PhotoSection.jsx'
import EmailSection from './EmailSection.jsx'
import PasswordSection from './PasswordSection.jsx'
import { DeleteSection, SessionsSection } from './DangerSections.jsx'

export default function Account() {
  const { me } = useAuth()
  return (
    <div className="flex flex-col gap-6 py-8">
      <h1>Account</h1>
      {me ? (
        <>
          <ProfileSection me={me} />
          <PhotoSection me={me} />
          <EmailSection me={me} />
          <PasswordSection />
          <SessionsSection />
          <DeleteSection />
        </>
      ) : (
        <Skeleton className="h-48 w-full" />
      )}
    </div>
  )
}
