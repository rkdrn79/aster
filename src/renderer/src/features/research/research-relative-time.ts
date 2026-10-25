import { formatUiRelativeTime } from '@/i18n/relative-time-format'

/** `just now` under a minute, else `5 minutes ago` / `2 hours ago`; `recently` for a bad date. */
export function researchRelativeTime(at: string, now = Date.now()): string {
  const time = Date.parse(at)
  if (Number.isNaN(time)) {
    return 'recently'
  }
  return Math.abs(now - time) < 60_000 ? 'just now' : formatUiRelativeTime(time - now)
}
