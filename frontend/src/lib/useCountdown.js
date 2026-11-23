import { useEffect, useRef, useState } from 'react'

const TICK_MS = 60000

function formatRemaining(ms) {
  const minutes = Math.ceil(ms / 60000)
  if (minutes < 1) return 'Under 1 min'
  if (minutes < 60) return `${minutes} min`
  if (minutes < 1440) {
    const m = minutes % 60
    return m ? `${Math.floor(minutes / 60)} h ${m} min` : `${Math.floor(minutes / 60)} h`
  }
  const h = Math.floor((minutes % 1440) / 60)
  const d = Math.floor(minutes / 1440)
  return h ? `${d} d ${h} h` : `${d} d`
}

// Ticks every 60 s and exactly at expiry; onExpire fires once per deadline.
export function useCountdown(deadlineIso, { onExpire } = {}) {
  const [now, setNow] = useState(() => Date.now())
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onExpireRef.current = onExpire
  })

  useEffect(() => {
    if (!deadlineIso) return undefined
    const target = new Date(deadlineIso).getTime()
    let timer
    const schedule = (first) => {
      const left = target - Date.now()
      const delay = first ? 0 : Math.max(0, Math.min(TICK_MS, left))
      timer = setTimeout(() => {
        setNow(Date.now())
        if (target - Date.now() <= 0) {
          onExpireRef.current?.()
          return
        }
        schedule(false)
      }, delay)
    }
    schedule(true)
    return () => clearTimeout(timer)
  }, [deadlineIso])

  if (!deadlineIso) return { remainingMs: null, expired: false, label: '' }
  const remainingMs = Math.max(0, new Date(deadlineIso).getTime() - now)
  const expired = remainingMs === 0
  return { remainingMs, expired, label: expired ? 'Expired' : formatRemaining(remainingMs) }
}
