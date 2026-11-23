import { useEffect, useRef, useState } from 'react'

const TOKEN_RE = /^[a-f0-9]{64}$/

// Reads `#token=...` once, removes it from the address bar, and keeps it in a ref so a
// StrictMode remount (which sees the stripped URL) still gets the same value.
// Returns undefined until read, then the token, or null when missing or malformed.
export default function useFragmentToken() {
  const ref = useRef(undefined)
  const [token, setToken] = useState(undefined)
  useEffect(() => {
    if (ref.current === undefined) {
      const raw = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token')
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      ref.current = raw && TOKEN_RE.test(raw) ? raw : null
    }
    setToken(ref.current)
  }, [])
  return token
}
