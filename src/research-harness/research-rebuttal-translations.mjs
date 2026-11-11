import { invalid, isObject, list, text } from './research-rebuttal-fields.mjs'
import { REBUTTAL_SCHEMA_VERSION } from './research-rebuttal-model.mjs'
import { replyHash } from './research-rebuttal-records.mjs'

// Why no node imports: the app reads the same file in the renderer.
// A translation is kept with the hash of the text it translates, so an edit to that text marks
// it outdated instead of hiding it, and undoing the edit makes it current again.

export const MAX_TRANSLATION_CHARS = 400_000
/** Translations kept per item and language: the latest few, so an undo finds its translation. */
const KEEP_PER_ITEM = 3
const MAX_TRANSLATIONS = 4000
const LANGUAGE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/
const REVIEWER = 'R[1-9][0-9]?'
const CLUSTER = 'C[1-9][0-9]{0,2}'
const KEY = new RegExp(
  `^(?:(?:quote|summary):${REVIEWER}-[WQM][1-9][0-9]{0,2}|title:${CLUSTER}|reply:(?:${CLUSTER}|opening:${REVIEWER}|general:(?:intro|closing))|review:${REVIEWER}(?:-round-[1-9][0-9]?)?)$`
)

/** What a key names, for grouping: a concern, a reply, or a review. */
export function translationGroup(key) {
  return key.startsWith('reply:') ? 'reply' : key.startsWith('review:') ? 'review' : 'concern'
}

export function safeLanguage(value) {
  if (typeof value !== 'string' || !LANGUAGE.test(value)) {
    throw invalid(`A language is a code such as ko, ja or zh, got: ${String(value)}`)
  }
  return value
}

export function safeTranslationKey(value) {
  if (typeof value !== 'string' || !KEY.test(value)) {
    throw invalid(
      `A translation key looks like quote:R1-W2, summary:R1-W2, title:C3, reply:C3, reply:opening:R1, reply:general:intro, review:R1 or review:R1-round-2; got: ${String(value)}`
    )
  }
  return value
}

/**
 * Every text a reader may want translated, by key. A concern is its title when it has a group,
 * else its summary, plus each quote; replies, openings and the general response; each review and
 * follow-up round.
 */
export function translationSources({ meta, points, clusters, reviews, followUps }) {
  const sources = new Map()
  const add = (key, value) => {
    if (typeof value === 'string' && value.trim()) {
      sources.set(key, value)
    }
  }
  const grouped = new Set(clusters.flatMap((cluster) => cluster.points))
  for (const reviewer of meta.reviewers) {
    add(`review:${reviewer.id}`, reviews?.[reviewer.id])
  }
  for (const followUp of followUps ?? []) {
    add(`review:${followUp.reviewer}-round-${followUp.round}`, followUp.text)
  }
  for (const cluster of clusters) {
    add(`title:${cluster.id}`, cluster.title)
  }
  for (const point of points) {
    if (!grouped.has(point.id)) {
      add(`summary:${point.id}`, point.summary)
    }
    add(`quote:${point.id}`, point.quote)
  }
  for (const cluster of clusters) {
    add(`reply:${cluster.id}`, cluster.response)
  }
  for (const reviewer of meta.reviewers) {
    add(`reply:opening:${reviewer.id}`, reviewer.opening)
  }
  add('reply:general:intro', meta.general.intro)
  add('reply:general:closing', meta.general.closing)
  return sources
}

export function parseTranslations(value) {
  const entries = list(value ?? [], 'translations', 'translations').map((entry, index) => {
    if (!isObject(entry)) {
      throw invalid(`translations[${index}] must be an object`)
    }
    return {
      key: safeTranslationKey(entry.key),
      language: safeLanguage(entry.language),
      hash: text(entry.hash, `translations[${index}].hash`, { max: 16, required: true }),
      text: text(entry.text, `${entry.key} translation`, {
        max: MAX_TRANSLATION_CHARS,
        required: true
      }),
      at: text(entry.at, `${entry.key} at`, { max: 64 })
    }
  })
  return entries
}

export function translationsDocument(translations) {
  return { schemaVersion: REBUTTAL_SCHEMA_VERSION, translations }
}

/** Adds translations (newest last), keeping the latest few per item and language. */
export function withTranslations(translations, incoming, { language, now }) {
  const replaced = new Set(incoming.map((item) => `${item.key}|${item.hash}`))
  const kept = translations.filter(
    (entry) => entry.language !== language || !replaced.has(`${entry.key}|${entry.hash}`)
  )
  const next = [
    ...kept,
    ...incoming.map((item) => ({
      key: item.key,
      language,
      hash: item.hash,
      text: item.text,
      at: now
    }))
  ]
  const seen = new Map()
  const trimmed = []
  for (const entry of next.toReversed()) {
    const slot = `${entry.key}|${entry.language}`
    const count = seen.get(slot) ?? 0
    if (count < KEEP_PER_ITEM) {
      seen.set(slot, count + 1)
      trimmed.push(entry)
    }
  }
  return trimmed.slice(0, MAX_TRANSLATIONS).toReversed()
}

/** The translation to show under `source`: the one made from it, else the latest, outdated. */
export function translationFor(translations, key, language, source) {
  let latest = null
  let match = null
  const hash = replyHash(source)
  for (const entry of translations) {
    if (entry.key === key && entry.language === language) {
      latest = entry
      if (entry.hash === hash) {
        match = entry
      }
    }
  }
  const chosen = match ?? latest
  return chosen ? { text: chosen.text, outdated: !match, at: chosen.at } : null
}

/** Each item's state in one language: current, outdated (its text changed since) or missing. */
export function translationStatus(translations, sources, language) {
  return [...sources].map(([key, source]) => {
    const found = translationFor(translations, key, language, source)
    return {
      key,
      source,
      hash: replyHash(source),
      status: !found ? 'missing' : found.outdated ? 'outdated' : 'current'
    }
  })
}
