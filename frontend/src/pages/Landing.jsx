import { Tape } from '../components/tape/index.js'
import { LinkButton } from '../components/ui/index.js'
import { useDocumentTitle } from '../layouts/useDocumentTitle.js'
import { MILESTONES } from '../lib/requestStatus.js'
import ExampleRequest from './landing/ExampleRequest.jsx'

const STEPS = [
  'You describe the job and pick an inspection time.',
  'The artisan accepts and sets an inspection fee. The payment is recorded on the request.',
  'The artisan visits and marks the inspection done.',
  'They send one fixed quote. You approve or decline it before it expires.',
  'A 70% deposit is recorded to book the repair. The artisan picks the repair window in the quote.',
  'The artisan reports the repair finished. If something is wrong, report it before you confirm.',
  'The 30% balance is recorded, the job closes and you can leave a review.',
]

const ARTISAN_POINTS = [
  ['You set the price', 'You choose your inspection fee and write each quote yourself.'],
  ['No double-booking', 'Once an inspection or repair is booked, that time is closed to other requests.'],
  ['Ratings from finished jobs', 'Only homeowners whose repair was completed can rate you.'],
]

const NOT_YET = [
  'Messaging inside Fixly. Share contact details only through the job notes you choose to write.',
  'Rescheduling a booked inspection or repair.',
  'Changing a quote after it is sent. The artisan sends a new request instead.',
  'Paying online. Payments are recorded on the request for now.',
]

export default function Landing() {
  useDocumentTitle('Repairs with every step on record')

  return (
    <div className="space-y-12 pb-12 lg:space-y-16 lg:pb-16">
      <section className="grid grid-cols-1 gap-x-6 gap-y-8 pt-8 lg:grid-cols-12 lg:pt-16">
        <div className="lg:col-span-7">
          <h1 className="max-w-[18ch] text-display lg:text-[49px] lg:leading-[1.1]">
            Get a repair inspected, quoted and booked, with every step on record.
          </h1>
          <p className="mt-6 max-w-[52ch] text-fg-2">
            Pick a plumber, electrician or other artisan, ask for an inspection, and see who has to act next
            until the repair is done.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <LinkButton to="/artisans">Find an artisan</LinkButton>
            <LinkButton to="/register?role=artisan" variant="secondary">I'm an artisan</LinkButton>
          </div>
        </div>
        <div className="lg:col-span-5">
          <ExampleRequest />
        </div>
      </section>

      <section aria-labelledby="how-title">
        <h2 id="how-title" className="max-w-[24ch] text-h2">How a job runs, from request to settled</h2>
        <div className="mt-8">
          <Tape status="completed" view={{ status: 'completed' }} />
        </div>
        <ol className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-7">
          {STEPS.map((text, i) => (
            <li key={MILESTONES[i]} className="border-t border-border pt-3">
              <h3 className="text-body font-bold lg:sr-only">{MILESTONES[i]}</h3>
              <p className="mt-1 text-caption text-fg-2 text-pretty lg:mt-0">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="artisans-title" className="grid grid-cols-1 gap-x-6 gap-y-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 id="artisans-title" className="text-h2">For artisans</h2>
          <p className="mt-3 max-w-[40ch] text-fg-2">
            Check requests on your phone, accept the ones you want, and quote after you have seen the job.
          </p>
          <LinkButton to="/register?role=artisan" variant="secondary" className="mt-6">
            Register as an artisan
          </LinkButton>
        </div>
        <dl className="space-y-4 lg:col-span-7 lg:col-start-6">
          {ARTISAN_POINTS.map(([term, text]) => (
            <div key={term} className="border-t border-border pt-3">
              <dt className="font-display text-h3 font-bold">{term}</dt>
              <dd className="mt-1 max-w-[60ch] text-fg-2">{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="notyet-title" className="grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-12">
        <h2 id="notyet-title" className="text-h3 lg:col-span-4">What Fixly does not do yet</h2>
        <ul className="max-w-[60ch] list-disc space-y-2 pl-5 text-fg-2 lg:col-span-7 lg:col-start-6">
          {NOT_YET.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
