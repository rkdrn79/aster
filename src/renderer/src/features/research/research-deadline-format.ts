import {
  formatUtcOffset,
  parseDeadlineZone,
  resolveDeadlineInstant
} from '../../../../shared/research/conference-deadline-time'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export type DeadlineTone = 'past' | 'urgent' | 'soon' | 'later'

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function availableTimeZones(): string[] {
  const zones =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return zones.includes('UTC') ? zones : ['UTC', ...zones]
}

const formatters = new Map<string, Intl.DateTimeFormat>()

// Why: the conference list formats hundreds of dates on every clock tick.
function cachedFormatter(
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone })
    formatters.set(key, formatter)
  }
  return formatter
}

export function formatDeadlineDateTime(epochMs: number, timeZone: string, locale: string): string {
  return cachedFormatter(locale, timeZone, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(epochMs)
}

/** A calendar date with no time, for all-day items such as the conference itself. */
export function formatDeadlineDate(epochMs: number, timeZone: string, locale: string): string {
  return cachedFormatter(locale, timeZone, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(epochMs)
}

export function formatDeadlineRange(
  startMs: number,
  endMs: number,
  timeZone: string,
  locale: string
): string {
  return cachedFormatter(locale, timeZone, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).formatRange(startMs, endMs)
}

/** Short offset label such as `GMT+9` for the zone at that instant. */
export function formatZoneOffset(epochMs: number, timeZone: string, locale: string): string {
  const parts = cachedFormatter(locale, timeZone, { timeZoneName: 'shortOffset' })
    .formatToParts(epochMs)
    .find((part) => part.type === 'timeZoneName')
  return parts?.value ?? timeZone
}

export function formatMonthLabel(epochMs: number, timeZone: string, locale: string): string {
  return cachedFormatter(locale, timeZone, { year: 'numeric', month: 'long' }).format(epochMs)
}

export function formatShortMonth(epochMs: number, timeZone: string, locale: string): string {
  return cachedFormatter(locale, timeZone, { month: 'short' }).format(epochMs)
}

/** The conference's own wording, e.g. `2026-11-13 23:59 AoE (UTC-12)`. */
export function formatStatedTime(wallClock: string, timezone: string): string {
  const time = wallClock.replace('T', ' ').replace(/^(\S+ \d{2}:\d{2}):\d{2}$/, '$1')
  const zone = parseDeadlineZone(timezone)
  const stated = timezone.trim() || 'no timezone'
  const offset =
    zone?.kind === 'offset' && !/^(?:UTC|GMT)[+-]/i.test(stated)
      ? ` (${formatUtcOffset(zone.minutes)})`
      : ''
  return `${time} ${stated}${offset}`
}

export function deadlineTone(epochMs: number, now: number): DeadlineTone {
  const remaining = epochMs - now
  if (remaining < 0) {
    return 'past'
  }
  return remaining < 2 * DAY ? 'urgent' : remaining < 14 * DAY ? 'soon' : 'later'
}

export function formatCountdown(epochMs: number, now: number): string {
  const remaining = epochMs - now
  const span = Math.abs(remaining)
  const days = Math.floor(span / DAY)
  const hours = Math.floor((span % DAY) / HOUR)
  const minutes = Math.floor((span % HOUR) / MINUTE)
  const amount =
    days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  return remaining < 0 ? `Closed ${amount} ago` : `${amount} left`
}

/** Compact D-day text for narrow chrome such as the navigation badge. */
export function formatDayCount(epochMs: number, now: number): string {
  const remaining = epochMs - now
  return remaining >= DAY
    ? `D-${Math.floor(remaining / DAY)}`
    : `${Math.max(1, Math.ceil(remaining / HOUR))}h`
}

/** Instants for the first day of `count` consecutive months in `timeZone`, starting with `now`'s. */
export function monthStarts(now: number, timeZone: string, count: number): number[] {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric'
  }).formatToParts(now)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  return Array.from({ length: count }, (_, index) => {
    const total = month - 1 + index
    const label = `${year + Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01 00:00`
    return resolveDeadlineInstant(label, timeZone)?.epochMs ?? now
  })
}
