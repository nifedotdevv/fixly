import { lazy, Suspense } from 'react'

const Specimen = import.meta.env.DEV ? lazy(() => import('./dev/Specimen.jsx')) : null

export default function App() {
  if (import.meta.env.DEV && location.pathname === '/dev/specimen') {
    return (
      <Suspense fallback={null}>
        <Specimen />
      </Suspense>
    )
  }
  return (
    <main>
      <h1>Fixly</h1>
    </main>
  )
}
