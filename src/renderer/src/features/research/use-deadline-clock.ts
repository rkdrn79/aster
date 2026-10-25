import { useEffect, useState } from 'react'

/** Current time, re-read on an interval so countdowns stay live. */
export function useDeadlineClock(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}
