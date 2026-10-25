import { i18n, translate } from '@/i18n/i18n'
import { withProductName } from '../../../../shared/product-brand'

export type SearchKeywordSpec = {
  key: string
  fallback: string
  /** Extra English aliases kept when UI is localized (brands, acronyms). */
  aliases?: string[]
  /** When true, only the fallback/aliases are indexed — no localized variant. */
  englishOnly?: boolean
}

// Why: settings search should match localized copy and English aliases devs still type.
export function translateSearchKeyword(
  key: string,
  fallback: string,
  options?: Omit<SearchKeywordSpec, 'key' | 'fallback'>
): string[] {
  // Why: English fallbacks skip i18n, so brand them here like every other product copy.
  const brandedFallback = withProductName(fallback)
  if (options?.englishOnly || i18n.language === 'en') {
    return uniqueKeywords([brandedFallback, ...(options?.aliases ?? [])])
  }

  const localized = translate(key, fallback)
  return uniqueKeywords([localized, brandedFallback, ...(options?.aliases ?? [])])
}

export function searchKeywords(terms: (string | SearchKeywordSpec)[]): string[] {
  return uniqueKeywords(
    terms.flatMap((term) => {
      if (typeof term === 'string') {
        return [term]
      }
      return translateSearchKeyword(term.key, term.fallback, term)
    })
  )
}

export function uniqueKeywords(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) {
      continue
    }
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}
