export type DeadlineZone = { kind: 'offset'; minutes: number } | { kind: 'iana'; name: string }

export type DeadlineInstant = {
  epochMs: number
  /** False when the stated zone was missing or unknown and AoE was assumed instead. */
  zoneRecognized: boolean
}

const AOE_MINUTES = -12 * 60

// Why: only unambiguous abbreviations; CST, IST and BST each name several zones.
const FIXED_ABBREVIATIONS: Record<string, number> = {
  AOE: AOE_MINUTES,
  'ANYWHERE ON EARTH': AOE_MINUTES,
  UTC: 0,
  GMT: 0,
  UT: 0,
  Z: 0,
  PST: -8 * 60,
  PDT: -7 * 60,
  MST: -7 * 60,
  MDT: -6 * 60,
  CDT: -5 * 60,
  EST: -5 * 60,
  EDT: -4 * 60,
  CET: 60,
  CEST: 2 * 60,
  KST: 9 * 60,
  JST: 9 * 60,
  SGT: 8 * 60,
  AEST: 10 * 60,
  AEDT: 11 * 60
}

const REGIONAL_ABBREVIATIONS: Record<string, string> = {
  PT: 'America/Los_Angeles',
  MT: 'America/Denver',
  CT: 'America/Chicago',
  ET: 'America/New_York'
}

const formatterCache = new Map<string, Intl.DateTimeFormat | null>()

function zoneFormatter(timeZone: string): Intl.DateTimeFormat | null {
  if (!formatterCache.has(timeZone)) {
    let formatter: Intl.DateTimeFormat | null = null
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
      })
    } catch {
      formatter = null
    }
    formatterCache.set(timeZone, formatter)
  }
  return formatterCache.get(timeZone) ?? null
}

export function isKnownTimeZone(timeZone: string): boolean {
  return zoneFormatter(timeZone) !== null
}

export function parseDeadlineZone(raw: string | undefined): DeadlineZone | null {
  // Why \u2212: calls for papers write `UTC−5` with a minus sign, and orcad's bundle must stay ASCII.
  const text = raw?.trim().replace(/\u2212/g, '-') ?? ''
  if (!text) {
    return null
  }
  const upper = text.toUpperCase()
  if (upper in FIXED_ABBREVIATIONS) {
    return { kind: 'offset', minutes: FIXED_ABBREVIATIONS[upper] }
  }
  if (upper in REGIONAL_ABBREVIATIONS) {
    return { kind: 'iana', name: REGIONAL_ABBREVIATIONS[upper] }
  }
  const offset = /^(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(text)
  if (offset) {
    const hours = Number(offset[2])
    const minutes = Number(offset[3] ?? 0)
    if (hours > 14 || minutes > 59) {
      return null
    }
    const total = hours * 60 + minutes
    return { kind: 'offset', minutes: offset[1] === '-' ? -total : total }
  }
  return text.includes('/') && isKnownTimeZone(text) ? { kind: 'iana', name: text } : null
}

/** Offset of `timeZone` from UTC, in minutes, at the given instant. */
export function timeZoneOffsetMinutes(epochMs: number, timeZone: string): number {
  const formatter = zoneFormatter(timeZone)
  if (!formatter) {
    return 0
  }
  const wholeSecond = Math.floor(epochMs / 1000) * 1000
  const parts = formatter.formatToParts(new Date(wholeSecond))
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((entry) => entry.type === type)?.value ?? 0)
  const asUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second')
  )
  return Math.round((asUtc - wholeSecond) / 60_000)
}

function parseWallClock(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text.trim())
  if (!match) {
    return null
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  // Why: a date with no time means the whole day is still open, as calls for papers intend.
  const [hour, minute, second] = match[4]
    ? [Number(match[4]), Number(match[5]), Number(match[6] ?? 0)]
    : [23, 59, 59]
  const naive = Date.UTC(year, month - 1, day, hour, minute, second)
  const check = new Date(naive)
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null
  }
  return naive
}

/** Converts a call-for-papers wall-clock time in its stated zone to an absolute instant. */
export function resolveDeadlineInstant(
  wallClock: string,
  timezone: string | undefined
): DeadlineInstant | null {
  const naive = parseWallClock(wallClock)
  if (naive === null) {
    return null
  }
  const zone = parseDeadlineZone(timezone)
  if (!zone) {
    return { epochMs: naive - AOE_MINUTES * 60_000, zoneRecognized: false }
  }
  if (zone.kind === 'offset') {
    return { epochMs: naive - zone.minutes * 60_000, zoneRecognized: true }
  }
  const guess = timeZoneOffsetMinutes(naive, zone.name)
  let epochMs = naive - guess * 60_000
  const settled = timeZoneOffsetMinutes(epochMs, zone.name)
  if (settled !== guess) {
    epochMs = naive - settled * 60_000
  }
  return { epochMs, zoneRecognized: true }
}

export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const absolute = Math.abs(minutes)
  const hours = Math.floor(absolute / 60)
  const rest = absolute % 60
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`
}
