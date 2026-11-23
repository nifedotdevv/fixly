import { useEffect, useRef, useState } from 'react'
import { Banknote, CalendarCheck, HardHat, Smartphone, Star } from 'lucide-react'
import { LinkButton } from '../../components/ui/index.js'
import { BookingMock, FeeMock, IncomingMock, RatingMock } from './mocks.jsx'
import { useMediaQuery } from './useMediaQuery.js'

const ITEMS = [
  { Icon: Banknote, title: 'You set the price', body: 'You choose your inspection fee and write each quote yourself.', Mock: FeeMock, tone: 'media-lime' },
  { Icon: CalendarCheck, title: 'No double-booking', body: 'Once an inspection or repair is booked, that time is closed to other requests.', Mock: BookingMock, tone: 'media-teal' },
  { Icon: Star, title: 'Ratings from finished jobs', body: 'Only homeowners whose repair was completed can rate you.', Mock: RatingMock, tone: 'media-lemon' },
  { Icon: Smartphone, title: 'Requests on your phone', body: 'See new requests on site and accept or decline them in a tap.', Mock: IncomingMock, tone: 'media-lime' },
]

export default function ArtisanScroll() {
  const wide = useMediaQuery('(min-width: 64rem)')
  const [active, setActive] = useState(0)
  const itemRefs = useRef([])

  useEffect(() => {
    if (!wide || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number(entry.target.dataset.index))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    itemRefs.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [wide])

  return (
    <section
      id="artisans"
      aria-labelledby="artisans-title"
      className="mx-auto w-full max-w-[1200px] px-4 py-12 sm:px-8 lg:px-0 lg:py-30"
    >
      <div className="grid gap-12 lg:grid-cols-[532px_580px] lg:justify-between">
        <div>
          {/* Sticks just under the 68px nav; the top padding covers the gap so list items never show above it. */}
          <div className="lg:sticky lg:top-17 lg:z-10 lg:-mt-24 lg:bg-bg lg:pt-24 lg:pb-6">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-6 items-center justify-center rounded-[7px] bg-lime text-on-bright">
                <HardHat size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="text-body font-medium">For artisans</span>
            </div>
            <h2 id="artisans-title" className="heading-serif mt-4 text-title sm:text-display-xs lg:text-display-md">
              Quote after you have seen the job
            </h2>
          </div>

          <ul className="mt-8 border-b border-divider">
            {ITEMS.map(({ Icon, title, body, Mock, tone }, i) => {
              const on = i === active
              return (
                <li
                  key={title}
                  ref={(el) => { itemRefs.current[i] = el }}
                  data-index={i}
                  className="relative border-t border-divider py-6 lg:py-14"
                >
                  {on && <span aria-hidden="true" className="absolute -top-px left-0 h-0.5 w-24 bg-lime" />}
                  <h3 className="text-lead font-medium">
                    <button
                      type="button"
                      aria-current={on ? 'true' : undefined}
                      onClick={() => setActive(i)}
                      className={`scroll-item-text flex w-full items-center gap-3 rounded-sm text-left ${on ? 'text-fg' : 'text-muted hover:text-fg-2'}`}
                    >
                      <Icon size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
                      {title}
                    </button>
                  </h3>
                  <p className={`scroll-item-text mt-3 max-w-[460px] text-body ${on ? 'text-muted' : 'text-muted lg:hidden'}`}>{body}</p>
                  {on && (
                    <div className={`${tone} mt-6 aspect-square overflow-hidden rounded-xl p-8 lg:hidden`}>
                      <Mock />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <LinkButton variant="secondary" to="/register?role=artisan" className="mt-8">
            Register as an artisan
          </LinkButton>
        </div>

        <div className="hidden lg:sticky lg:top-[164px] lg:block lg:self-start">
          <div className="relative aspect-square overflow-hidden rounded-4xl">
            {ITEMS.map(({ Mock, title, tone }, i) => (
              <div
                key={title}
                data-active={i === active}
                aria-hidden={i === active ? undefined : 'true'}
                inert={i !== active}
                className={`scroll-mock ${tone} absolute inset-0 flex items-center px-20`}
              >
                <Mock />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
