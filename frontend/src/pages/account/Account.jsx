import { useEffect, useState } from 'react'
import { PageHeader, Select, Skeleton } from '../../components/ui/index.js'
import { useAuth } from '../../auth/useAuth.js'
import { useDocumentTitle } from '../../layouts/useDocumentTitle.js'
import ProfileSection from './ProfileSection.jsx'
import PhotoSection from './PhotoSection.jsx'
import EmailSection from './EmailSection.jsx'
import PasswordSection from './PasswordSection.jsx'
import { DeleteSection, SessionsSection } from './DangerSections.jsx'
import { sectionId } from './helpers.js'

const SECTIONS = ['Profile', 'Photo', 'Email', 'Password', 'Sessions', 'Delete account'].map((label) => ({
  label,
  id: sectionId(label),
}))

// The section nearest the top of the viewport, so the sidebar list follows the scroll.
function useActiveSection(ready) {
  const [active, setActive] = useState(null)
  useEffect(() => {
    if (!ready || typeof IntersectionObserver === 'undefined') return undefined
    const visible = new Set()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id))
        setActive(SECTIONS.find((s) => visible.has(s.id))?.id ?? null)
      },
      { rootMargin: '0px 0px -60% 0px' },
    )
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [ready])
  return active
}

function jumpTo(id) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView?.({ block: 'start' })
  const heading = el.querySelector('h2')
  if (heading) {
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }
}

function SectionNav({ active }) {
  return (
    <>
      <nav aria-label="Account sections" className="hidden self-start lg:sticky lg:top-6 lg:block">
        <ul className="flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={active === s.id ? 'true' : undefined}
                className={`relative flex min-h-11 items-center rounded-sm px-3 text-small ${
                  active === s.id
                    ? 'bg-lime-soft font-semibold text-fg before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-lime'
                    : 'text-fg-2 hover:bg-surface-2 hover:text-fg'
                }`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="lg:hidden">
        <label htmlFor="account-jump" className="mb-2 block font-medium text-fg">Jump to section</label>
        <Select
          id="account-jump"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) jumpTo(e.target.value)
            e.target.value = ''
          }}
        >
          <option value="">Choose a section</option>
          {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
      </div>
    </>
  )
}

export default function Account() {
  const { me } = useAuth()
  useDocumentTitle('Account')
  const active = useActiveSection(Boolean(me))
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        className="mb-0!"
        title="Account"
        summary="Manage your profile, sign-in details and account."
      />
      {me ? (
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
          <SectionNav active={active} />
          <div className="flex min-w-0 flex-col gap-6">
            <ProfileSection me={me} />
            <PhotoSection me={me} />
            <EmailSection me={me} />
            <PasswordSection />
            <SessionsSection />
            <DeleteSection />
          </div>
        </div>
      ) : (
        <Skeleton className="h-48 w-full" />
      )}
    </div>
  )
}
