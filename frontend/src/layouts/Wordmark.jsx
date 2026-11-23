import { Link } from 'react-router'
// Logo: a solid wrench silhouette in the current text colour (navy on light, white on the footer band),
// then the name in Geist. Lucide's wrench outline (ISC), filled and thickened so it reads as one shape.
const WRENCH = 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z'

export function LogoMark({ size = 28, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      <path d={WRENCH} />
    </svg>
  )
}

export default function Wordmark({ to = '/', className = '' }) {
  return (
    <Link
      to={to}
      translate="no"
      className={`inline-flex items-center gap-2 text-[1.375rem] font-semibold tracking-[-0.03em] text-fg ${className}`}
    >
      <LogoMark size={24} />
      Fixly
    </Link>
  )
}
