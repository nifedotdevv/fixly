import { act, renderHook } from '@testing-library/react'
import { useCountdown } from './useCountdown'

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2027-01-12T09:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('ticks, expires exactly at the deadline and fires onExpire once', () => {
    const onExpire = vi.fn()
    const deadline = new Date(Date.now() + 90 * 1000).toISOString()
    const { result } = renderHook(() => useCountdown(deadline, { onExpire }))
    expect(result.current.expired).toBe(false)
    expect(result.current.label).toBe('2 min')
    act(() => vi.advanceTimersByTime(60000))
    expect(result.current.remainingMs).toBe(30000)
    expect(onExpire).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(30000))
    expect(result.current.expired).toBe(true)
    expect(result.current.label).toBe('Expired')
    expect(onExpire).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(300000))
    expect(onExpire).toHaveBeenCalledTimes(1)
  })

  it('stops timers on unmount', () => {
    const onExpire = vi.fn()
    const deadline = new Date(Date.now() + 60000).toISOString()
    const { unmount } = renderHook(() => useCountdown(deadline, { onExpire }))
    unmount()
    act(() => vi.advanceTimersByTime(120000))
    expect(onExpire).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('handles a missing deadline', () => {
    const { result } = renderHook(() => useCountdown(null))
    expect(result.current).toEqual({ remainingMs: null, expired: false, label: '' })
  })
})
