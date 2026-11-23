import Wordmark from '../../layouts/Wordmark.jsx'
import ThemeMenu from '../../components/theme/ThemeMenu.jsx'
import '../landing/landing.css'

/**
 * Full-page half-and-half frame for auth pages (the layout drops the top bar and footer here).
 * The wordmark at the top of the form half links home. Renders the page's single h1 from `title`.
 * The form sits on the left half; from 1024px the right half is the brand gradient with one line of copy,
 * kept on the dark top of the gradient so the light text stays readable.
 */
export default function AuthFrame({ title, intro, children }) {
  return (
    <div className="grid min-h-dvh w-full lg:grid-cols-2">
      <div className="flex flex-col px-4 py-5 sm:px-8 lg:px-12 lg:py-8">
        <div className="flex items-center justify-between">
          <Wordmark className="rounded-sm" />
          <ThemeMenu />
        </div>
        <div className="flex flex-1 items-start justify-center py-10 lg:items-center">
          <div className="flex w-full max-w-[400px] flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-h1">{title}</h1>
              {intro && <p className="text-muted">{intro}</p>}
            </div>
            {children}
          </div>
        </div>
      </div>
      {/* Pinned to the viewport so a long form (Register) scrolls past a gradient that always fills the screen. */}
      <div
        data-testid="auth-preview-column"
        aria-hidden="true"
        className="hero-gradient hidden flex-col justify-start gap-6 p-12 pt-24 text-on-band lg:sticky lg:top-0 lg:flex lg:h-dvh xl:p-16 xl:pt-28"
      >
        <p className="max-w-[18ch] text-display-md text-on-band">See which jobs need you and who acts next.</p>
        <p className="max-w-[40ch] text-lead text-on-band/80">
          Every request shows its stage, its deadline and whose turn it is.
        </p>
      </div>
    </div>
  )
}
