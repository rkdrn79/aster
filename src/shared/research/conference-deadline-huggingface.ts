import { parse } from 'yaml'
import {
  conferenceDeadlineSchema,
  conferenceEditionSchema,
  conferenceSeriesKey,
  type ConferenceDeadline,
  type ConferenceEdition
} from './conference-deadlines'
import { classifyDeadlineStage, parseEventStart } from './conference-deadline-stage'
import { conferenceRankSchema, conferenceTopic, type ConferenceRank } from './conference-topics'

type RawRecord = Record<string, unknown>

const MAX_DEADLINES_PER_EDITION = 40

export function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function yamlText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined
  }
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined
}

function labelFromType(type: string): string {
  const words = type.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function parseRankings(text: string | undefined): ConferenceRank {
  const ccf = /CCF:\s*(A|B|C|N)\b/i.exec(text ?? '')?.[1]?.toUpperCase()
  const core = /CORE:\s*(A\*|A|B|C|N)/i.exec(text ?? '')?.[1]?.toUpperCase()
  const parsed = conferenceRankSchema.safeParse({
    ...(ccf ? { ccf } : {}),
    ...(core ? { core } : {})
  })
  return parsed.success ? parsed.data : {}
}

function deadline(
  type: string | undefined,
  label: string | undefined,
  date: unknown,
  timezone: string | undefined
): ConferenceDeadline | null {
  const kind = type ?? 'deadline'
  const name = label ?? labelFromType(kind)
  const parsed = conferenceDeadlineSchema.safeParse({
    type: kind,
    label: name,
    stage: classifyDeadlineStage(kind, name),
    date: yamlText(date),
    timezone: timezone ?? '',
    source: 'huggingface'
  })
  return parsed.success ? parsed.data : null
}

/** Folds a rebuttal start/end pair into one window so it reads as a period. */
function pairRebuttalWindow(deadlines: ConferenceDeadline[]): ConferenceDeadline[] {
  const start = deadlines.find((entry) => entry.type === 'rebuttal_start')
  const end = deadlines.find((entry) => entry.type === 'rebuttal_end')
  if (!start || !end || start.timezone !== end.timezone || start.date > end.date) {
    return deadlines
  }
  return deadlines
    .filter((entry) => entry !== start)
    .map((entry) =>
      entry === end ? { ...end, label: 'Rebuttal period', opens: start.date } : entry
    )
}

function editionDeadlines(entry: RawRecord): ConferenceDeadline[] {
  const fallbackZone = yamlText(entry.timezone)
  const listed = Array.isArray(entry.deadlines) ? entry.deadlines.filter(isRecord) : []
  const items = listed.length
    ? listed.map((item) =>
        deadline(
          yamlText(item.type),
          yamlText(item.label),
          item.date ?? item.deadline,
          yamlText(item.timezone) ?? fallbackZone
        )
      )
    : [
        deadline('abstract', 'Abstract submission', entry.abstract_deadline, fallbackZone),
        deadline('paper', 'Paper submission', entry.deadline, fallbackZone)
      ]
  return pairRebuttalWindow(
    items.filter((item): item is ConferenceDeadline => item !== null)
  ).slice(0, MAX_DEADLINES_PER_EDITION)
}

function edition(entry: RawRecord): ConferenceEdition | null {
  const year = typeof entry.year === 'number' ? entry.year : Number(yamlText(entry.year))
  const title = yamlText(entry.title)
  if (!title || !Number.isInteger(year)) {
    return null
  }
  const series = conferenceSeriesKey(title)
  const link = yamlText(entry.link)
  const dates = yamlText(entry.date)
  const start = yamlText(entry.start)
  const place = [yamlText(entry.city), yamlText(entry.country)].filter(Boolean).join(', ')
  const tags = Array.isArray(entry.tags)
    ? entry.tags.map(yamlText).filter((tag): tag is string => Boolean(tag))
    : []
  const eventStart =
    start && /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : parseEventStart(dates, year)
  const candidate = {
    id: `${series}-${year}`,
    series,
    title,
    year,
    ...(yamlText(entry.full_name) ? { fullName: yamlText(entry.full_name) } : {}),
    ...(link && /^https?:\/\//i.test(link) ? { link } : {}),
    ...(dates ? { dates } : {}),
    ...(eventStart ? { start: eventStart } : {}),
    ...(place ? { place } : {}),
    tags: tags.slice(0, 20),
    topic: conferenceTopic(series, tags, undefined),
    rank: parseRankings(yamlText(entry.rankings)),
    deadlines: editionDeadlines(entry)
  }
  const parsed = conferenceEditionSchema.safeParse(candidate)
  if (parsed.success) {
    return parsed.data
  }
  // Why: one malformed link or tag should not hide a conference's deadlines.
  const { link: _link, ...core } = candidate
  const retried = conferenceEditionSchema.safeParse({ ...core, tags: [] })
  return retried.success ? retried.data : null
}

/** Normalizes one `src/data/conferences/<name>.yml` file from huggingface/ai-deadlines. */
export function parseHuggingFaceConferenceYaml(
  source: string,
  minYear: number
): ConferenceEdition[] {
  const document: unknown = parse(source)
  const entries = Array.isArray(document) ? document.filter(isRecord) : []
  return entries
    .map(edition)
    .filter((entry): entry is ConferenceEdition => entry !== null && entry.year >= minYear)
}

export function isConferenceYamlFileName(fileName: string): boolean {
  return /^[a-z0-9][a-z0-9_+.-]{0,63}\.ya?ml$/i.test(fileName)
}
