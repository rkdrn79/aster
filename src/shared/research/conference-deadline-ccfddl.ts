import { parse } from 'yaml'
import {
  conferenceDeadlineSchema,
  conferenceEditionSchema,
  conferenceSeriesKey,
  type ConferenceDeadline,
  type DeadlineStage,
  type ConferenceEdition
} from './conference-deadlines'
import { isRecord, yamlText } from './conference-deadline-huggingface'
import { parseEventStart } from './conference-deadline-stage'
import { conferenceRankSchema, conferenceTopic, type ConferenceRank } from './conference-topics'

type RawRecord = Record<string, unknown>

const ROUND_FIELDS: { field: string; type: string; label: string; stage: DeadlineStage }[] = [
  { field: 'abstract_deadline', type: 'abstract', label: 'Abstract', stage: 'submission' },
  { field: 'deadline', type: 'paper', label: 'Paper submission', stage: 'submission' },
  { field: 'rebuttal_deadline', type: 'rebuttal_end', label: 'Rebuttal', stage: 'rebuttal' },
  { field: 'decision_deadline', type: 'notification', label: 'Decision', stage: 'notification' }
]

function rank(value: unknown): ConferenceRank {
  if (!isRecord(value)) {
    return {}
  }
  const parsed = conferenceRankSchema.safeParse({
    ...(yamlText(value.ccf) ? { ccf: yamlText(value.ccf) } : {}),
    ...(yamlText(value.core) ? { core: yamlText(value.core) } : {})
  })
  return parsed.success ? parsed.data : {}
}

function roundDeadlines(edition: RawRecord): ConferenceDeadline[] {
  const rounds = Array.isArray(edition.timeline) ? edition.timeline.filter(isRecord) : []
  const timezone = yamlText(edition.timezone) ?? ''
  return rounds.flatMap((round, index) => {
    const suffix = rounds.length > 1 ? ` (round ${index + 1})` : ''
    const note = yamlText(round.comment)?.slice(0, 300)
    return ROUND_FIELDS.flatMap(({ field, type, label, stage }) => {
      const parsed = conferenceDeadlineSchema.safeParse({
        type,
        label: `${label}${suffix}`,
        stage,
        date: yamlText(round[field]),
        timezone,
        ...(note ? { note } : {}),
        source: 'ccfddl'
      })
      return parsed.success ? [parsed.data] : []
    })
  })
}

function conferenceEditions(conference: RawRecord, minYear: number): ConferenceEdition[] {
  const title = yamlText(conference.title)
  if (!title) {
    return []
  }
  const series = conferenceSeriesKey(title)
  const category = yamlText(conference.sub)
  const confs = Array.isArray(conference.confs) ? conference.confs.filter(isRecord) : []
  return confs.flatMap((entry) => {
    const year = typeof entry.year === 'number' ? entry.year : Number(yamlText(entry.year))
    if (!Number.isInteger(year) || year < minYear) {
      return []
    }
    const link = yamlText(entry.link)
    const dates = yamlText(entry.date)
    const start = parseEventStart(dates, year)
    const place = yamlText(entry.place)
    const parsed = conferenceEditionSchema.safeParse({
      id: `${series}-${year}`,
      series,
      title,
      year,
      ...(yamlText(conference.description)
        ? { fullName: yamlText(conference.description)?.slice(0, 300) }
        : {}),
      ...(link && /^https?:\/\//i.test(link) ? { link } : {}),
      ...(dates ? { dates: dates.slice(0, 120) } : {}),
      ...(start ? { start } : {}),
      ...(place ? { place: place.slice(0, 240) } : {}),
      tags: [],
      ...(category ? { category } : {}),
      topic: conferenceTopic(series, [], category),
      rank: rank(conference.rank),
      deadlines: roundDeadlines(entry).slice(0, 60)
    })
    return parsed.success ? [parsed.data] : []
  })
}

/** Normalizes ccfddl's combined `allconf.yml`, keeping editions from `minYear` on. */
export function parseCcfddlConferenceYaml(source: string, minYear: number): ConferenceEdition[] {
  const document: unknown = parse(source)
  return Array.isArray(document)
    ? document.filter(isRecord).flatMap((conference) => conferenceEditions(conference, minYear))
    : []
}
