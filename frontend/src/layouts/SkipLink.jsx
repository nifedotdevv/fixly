export default function SkipLink() {
  const onClick = (e) => {
    e.preventDefault()
    document.getElementById('main')?.focus()
  }
  return (
    <a
      href="#main"
      onClick={onClick}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:font-medium focus:text-fg focus:shadow-overlay"
    >
      Skip to main content
    </a>
  )
}
