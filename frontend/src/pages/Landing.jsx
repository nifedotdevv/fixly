import { LinkButton } from '../components/ui/index.js'
import { useDocumentTitle } from '../layouts/useDocumentTitle.js'
import Audiences from './landing/Audiences.jsx'
import ArtisanScroll from './landing/ArtisanScroll.jsx'
import FeatureTabs from './landing/FeatureTabs.jsx'
import StageCards from './landing/StageCards.jsx'
import './landing/landing.css'

const NOT_YET = [
  'Messaging inside Fixly. Share contact details only through the job notes you choose to write.',
  'Rescheduling a booked inspection or repair.',
  'Changing a quote after it is sent. The artisan sends a new request instead.',
  'Paying online. Payments are recorded on the request for now.',
]

export default function Landing() {
  useDocumentTitle('Repairs with every step on record')

  return (
    <>
      <FeatureTabs />
      <StageCards />
      <ArtisanScroll />

      <section
        aria-labelledby="notyet-title"
        className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 pb-12 sm:px-8 lg:grid-cols-[532px_1fr] lg:gap-22 lg:px-0 lg:pb-30"
      >
        <div>
          <h2 id="notyet-title" className="heading-serif text-title sm:text-display-xs lg:text-display-md">
            What Fixly does not do yet
          </h2>
          <p className="mt-4 max-w-[46ch] text-body text-muted">
            Plain about the limits, so nothing about a job surprises you later.
          </p>
        </div>
        <ul className="border-b border-divider">
          {NOT_YET.map((item, i) => (
            <li key={item} className="flex gap-4 border-t border-divider py-5 text-body text-fg-2">
              <span className="tabular w-6 shrink-0 text-small font-medium text-muted">{String(i + 1).padStart(2, '0')}</span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <Audiences />

      <section
        aria-labelledby="cta-title"
        className="soft-gradient mx-2 mb-2 rounded-xl px-4 py-16 text-center sm:mx-6 sm:mb-6 lg:rounded-3xl lg:py-30"
      >
        <h2 id="cta-title" className="mx-auto max-w-[640px] text-display-xs sm:text-display-md lg:text-display-lg">
          Start with an inspection
        </h2>
        <p className="mx-auto mt-6 max-w-[560px] text-body text-muted sm:text-lead">
          Find an artisan near you and pick a time that suits you.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <LinkButton size="large" to="/artisans">Find an artisan</LinkButton>
          <LinkButton variant="secondary" size="large" to="/register?role=artisan">
            Register as an artisan
          </LinkButton>
        </div>
      </section>
    </>
  )
}
