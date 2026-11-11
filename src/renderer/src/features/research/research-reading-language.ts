import { useCallback, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { getIntlLocale } from '@/i18n/i18n'

// The person's reading language: the Library answers in it, and the Rebuttal page shows
// translations into it. One setting, read and changed from either page.

export const READING_LANGUAGES = [
  { id: 'en', label: 'English', prompt: 'English' },
  { id: 'ko', label: '한국어', prompt: 'Korean (한국어)' },
  { id: 'ja', label: '日本語', prompt: 'Japanese (日本語)' },
  { id: 'zh', label: '中文', prompt: 'Simplified Chinese (简体中文)' },
  { id: 'es', label: 'Español', prompt: 'Spanish (Español)' },
  { id: 'de', label: 'Deutsch', prompt: 'German (Deutsch)' },
  { id: 'fr', label: 'Français', prompt: 'French (Français)' }
] as const

export type ReadingLanguageId = (typeof READING_LANGUAGES)[number]['id']

// Why the Library's key: the setting started there, and existing choices must carry over.
const LANGUAGE_STORAGE_KEY = 'aster.library.readingLanguage'
const listeners = new Set<() => void>()

function isReadingLanguage(value: string | null): value is ReadingLanguageId {
  return READING_LANGUAGES.some((language) => language.id === value)
}

export function readingLanguageInfo(id: ReadingLanguageId): (typeof READING_LANGUAGES)[number] {
  return READING_LANGUAGES.find((language) => language.id === id) ?? READING_LANGUAGES[0]
}

/** The reading language a UI locale implies: its language when the reader offers it, else English. */
function readingLanguageForLocale(locale: string): ReadingLanguageId {
  const language = locale.split(/[-_]/)[0].toLowerCase()
  return isReadingLanguage(language) ? language : 'en'
}

function savedReadingLanguage(): ReadingLanguageId | null {
  try {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return isReadingLanguage(saved) ? saved : null
  } catch {
    return null
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent): void => {
    if (event.key === LANGUAGE_STORAGE_KEY) {
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function chooseReadingLanguage(language: ReadingLanguageId): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  } catch {
    // The choice still applies for this window.
  }
  for (const listener of listeners) {
    listener()
  }
}

/**
 * The reading language and a setter that saves the choice for every page at once. Until the
 * person picks one it follows Aster's UI language, not the OS locale, which the UI may not use.
 */
export function useReadingLanguage(): [ReadingLanguageId, (language: ReadingLanguageId) => void] {
  // Why: re-renders on a UI language change so an unchosen default moves with it.
  useTranslation()
  const chosen = useSyncExternalStore(subscribe, savedReadingLanguage, () => null)
  const choose = useCallback((language: ReadingLanguageId) => chooseReadingLanguage(language), [])
  return [chosen ?? readingLanguageForLocale(getIntlLocale()), choose]
}
