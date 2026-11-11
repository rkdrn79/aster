import { writeJsonAtomically } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { loadRebuttal, updateRebuttal } from './research-rebuttal-files.mjs'
import { replyHash } from './research-rebuttal-records.mjs'
import {
  MAX_TRANSLATION_CHARS,
  safeLanguage,
  safeTranslationKey,
  translationSources,
  translationStatus,
  translationsDocument,
  withTranslations
} from './research-rebuttal-translations.mjs'

/** The text an item translates: the item as it stands, or a waiting proposal's text for a reply. */
function sourceFor(bundle, sources, item) {
  if (item.proposal === undefined || item.proposal === null) {
    const source = sources.get(item.key)
    if (!source) {
      throw new HarnessError(
        'not_found',
        `${item.key} has no text to translate. Run rebuttal translate list to see the items.`
      )
    }
    return source
  }
  const proposal = bundle.proposals.find((entry) => entry.id === item.proposal)
  if (!proposal || `reply:${proposal.slot}` !== item.key) {
    throw new HarnessError(
      'not_found',
      `No proposal ${String(item.proposal)} for ${item.key}. Run rebuttal proposals list.`
    )
  }
  return proposal.text
}

function readItems(input) {
  const items = Array.isArray(input) ? input : input?.items
  if (!Array.isArray(items) || !items.length) {
    throw new HarnessError(
      'invalid_argument',
      'Translations must be {"items":[{"key":"reply:C3","text":"…"}]} or a JSON array'
    )
  }
  return items.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new HarnessError('invalid_argument', `items[${index}] must be an object`)
    }
    const key = safeTranslationKey(item.key)
    if (typeof item.text !== 'string' || !item.text.trim()) {
      throw new HarnessError('invalid_argument', `The translation of ${key} is empty.`)
    }
    if (item.text.length > MAX_TRANSLATION_CHARS) {
      throw new HarnessError('invalid_argument', `The translation of ${key} is too long.`)
    }
    return { key, text: item.text.trim(), proposal: item.proposal }
  })
}

/**
 * Saves translations of rebuttal texts into one language. Each is stored with the hash of the
 * text it translates, read here from the record, so a later edit marks it outdated.
 */
export function setTranslations(project, slug, { language, input }) {
  const lang = safeLanguage(language)
  const items = readItems(input)
  return updateRebuttal(project, slug, async (bundle) => {
    const sources = translationSources(bundle)
    const incoming = items.map((item) => ({
      key: item.key,
      text: item.text,
      hash: replyHash(sourceFor(bundle, sources, item))
    }))
    const translations = withTranslations(bundle.translations, incoming, {
      language: lang,
      now: new Date().toISOString()
    })
    await writeJsonAtomically(bundle.files.translations, translationsDocument(translations))
    return { language: lang, saved: incoming.map((item) => item.key) }
  })
}

/** Which items are translated into a language; `todo` lists only missing and outdated ones. */
export async function listTranslations(project, slug, { language, todo }) {
  const lang = safeLanguage(language)
  const bundle = await loadRebuttal(project, slug)
  const status = translationStatus(bundle.translations, translationSources(bundle), lang)
  const counts = { current: 0, outdated: 0, missing: 0 }
  for (const item of status) {
    counts[item.status] += 1
  }
  const items = status
    .filter((item) => !todo || item.status !== 'current')
    .map(({ key, source, status: state }) => ({ key, status: state, source }))
  return { language: lang, counts, items }
}
