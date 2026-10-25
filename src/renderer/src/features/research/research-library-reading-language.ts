import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getIntlLocale } from '@/i18n/i18n'

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

const LANGUAGE_STORAGE_KEY = 'aster.library.readingLanguage'

function isReadingLanguage(value: string | null): value is ReadingLanguageId {
  return READING_LANGUAGES.some((language) => language.id === value)
}

/** The reading language a UI locale implies: its language when the reader offers it, else English. */
function readingLanguageForLocale(locale: string): ReadingLanguageId {
  const language = locale.split(/[-_]/)[0].toLowerCase()
  return isReadingLanguage(language) ? language : 'en'
}

function savedReadingLanguage(): ReadingLanguageId | null {
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return isReadingLanguage(saved) ? saved : null
}

/**
 * The answer language and a setter that saves the choice. Until the person picks one it follows
 * Aster's UI language, not the OS locale, which the UI may not use.
 */
export function useReadingLanguage(): [ReadingLanguageId, (language: ReadingLanguageId) => void] {
  // Why: re-renders on a UI language change so an unchosen default moves with it.
  useTranslation()
  const [chosen, setChosen] = useState(savedReadingLanguage)
  const choose = useCallback((language: ReadingLanguageId) => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    setChosen(language)
  }, [])
  return [chosen ?? readingLanguageForLocale(getIntlLocale()), choose]
}
