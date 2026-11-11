import { useCallback, useSyncExternalStore } from 'react'
import { replyHash } from '../../../../research-harness/research-rebuttal-records.mjs'
import {
  translationSources,
  type RebuttalTranslation,
  type RebuttalTranslationState
} from '../../../../research-harness/research-rebuttal-translations.mjs'
import { readingLanguageInfo, type ReadingLanguageId } from './research-reading-language'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'

/** both: the original, then its translation; original: no translations on the page. */
export type RebuttalTranslationView = 'both' | 'original'

const VIEW_KEY = 'aster.rebuttal.translationView'
const viewListeners = new Set<() => void>()

function savedView(): RebuttalTranslationView {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'original' ? 'original' : 'both'
  } catch {
    return 'both'
  }
}

function subscribeView(listener: () => void): () => void {
  viewListeners.add(listener)
  return () => viewListeners.delete(listener)
}

export function useRebuttalTranslationView(): [
  RebuttalTranslationView,
  (view: RebuttalTranslationView) => void
] {
  const view = useSyncExternalStore(subscribeView, savedView, () => 'both' as const)
  const choose = useCallback((next: RebuttalTranslationView) => {
    try {
      window.localStorage.setItem(VIEW_KEY, next)
    } catch {
      // The choice still applies until the page reloads.
    }
    for (const listener of viewListeners) {
      listener()
    }
  }, [])
  return [view, choose]
}

export type RebuttalTranslationFound = { text: string; outdated: boolean }

/** What the page needs to show translations: the language, and a lookup by item key. */
export type RebuttalTranslationLookup = {
  language: ReadingLanguageId
  label: string
  /** False for English or when the person chose Original only. */
  show: boolean
  find: (key: string, source: string) => RebuttalTranslationFound | null
}

/** Indexes one language's translations so each lookup checks only its own item. */
export function translationLookup(
  translations: readonly RebuttalTranslation[],
  language: ReadingLanguageId,
  view: RebuttalTranslationView
): RebuttalTranslationLookup {
  const byKey = new Map<string, RebuttalTranslation[]>()
  for (const entry of translations) {
    if (entry.language === language) {
      byKey.set(entry.key, [...(byKey.get(entry.key) ?? []), entry])
    }
  }
  return {
    language,
    label: readingLanguageInfo(language).label,
    show: language !== 'en' && view === 'both',
    find: (key, source) => {
      const own = byKey.get(key)
      if (!own?.length || !source.trim()) {
        return null
      }
      const hash = replyHash(source)
      const match = own.findLast((entry) => entry.hash === hash)
      const chosen = match ?? own.at(-1)!
      return { text: chosen.text, outdated: !match }
    }
  }
}

export type RebuttalTranslationTodo = {
  key: string
  hash: string
  status: Exclude<RebuttalTranslationState, 'current'>
}

/** Items with text but no current translation in `language`; none for English. */
export function translationTodo(
  snapshot: Pick<RebuttalSnapshot, 'bundle' | 'reviews' | 'followUps' | 'translations'>,
  language: ReadingLanguageId
): RebuttalTranslationTodo[] {
  if (language === 'en') {
    return []
  }
  const lookup = translationLookup(snapshot.translations, language, 'both')
  const sources = translationSources({
    ...snapshot.bundle,
    reviews: snapshot.reviews,
    followUps: snapshot.followUps
  })
  const todo: RebuttalTranslationTodo[] = []
  for (const [key, source] of sources) {
    const found = lookup.find(key, source)
    if (!found || found.outdated) {
      todo.push({ key, hash: replyHash(source), status: found ? 'outdated' : 'missing' })
    }
  }
  return todo
}

/**
 * The bundle with every translated text swapped in (originals where none exists), so the
 * assembled general response can be read in the reading language. Null when nothing is translated.
 */
export function translatedBundle(
  bundle: RebuttalSnapshot['bundle'],
  lookup: RebuttalTranslationLookup
): RebuttalSnapshot['bundle'] | null {
  let any = false
  const swap = (key: string, source: string): string => {
    const found = lookup.find(key, source)
    any ||= Boolean(found)
    return found?.text ?? source
  }
  const translated = {
    ...bundle,
    meta: {
      ...bundle.meta,
      general: {
        intro: swap('reply:general:intro', bundle.meta.general.intro),
        closing: swap('reply:general:closing', bundle.meta.general.closing)
      }
    },
    clusters: bundle.clusters.map((cluster) => ({
      ...cluster,
      title: swap(`title:${cluster.id}`, cluster.title),
      response: swap(`reply:${cluster.id}`, cluster.response)
    }))
  }
  return any ? translated : null
}
