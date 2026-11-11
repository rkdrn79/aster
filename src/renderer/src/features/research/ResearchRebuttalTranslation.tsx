import { createContext, useContext, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type {
  RebuttalTranslationFound,
  RebuttalTranslationLookup
} from './research-rebuttal-translation-view'

// Translations sit right under the text they translate, in a muted style behind a thin rule, so
// the original stays the thing being read and the translation reads as a reading aid.

const TranslationContext = createContext<RebuttalTranslationLookup | null>(null)

export function RebuttalTranslationProvider({
  value,
  children
}: {
  value: RebuttalTranslationLookup
  children: ReactNode
}): React.JSX.Element {
  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>
}

/** The page's translations when they are shown, or null for English or Original only. */
export function useRebuttalTranslationLookup(): RebuttalTranslationLookup | null {
  const lookup = useContext(TranslationContext)
  return lookup?.show ? lookup : null
}

/** The translation to show under `source`, or null when there is none or none is wanted. */
export function useRebuttalTranslation(
  key: string | null,
  source: string
): (RebuttalTranslationFound & { language: string; label: string }) | null {
  const lookup = useContext(TranslationContext)
  if (!lookup?.show || !key || !source.trim()) {
    return null
  }
  const found = lookup.find(key, source)
  return found ? { ...found, language: lookup.language, label: lookup.label } : null
}

function OutdatedTag(): React.JSX.Element {
  return (
    <span
      className="ml-1.5 text-3xs font-medium whitespace-nowrap text-status-warning"
      title="The original changed after this was translated"
    >
      Outdated
    </span>
  )
}

/** A short translation under a title or quote. */
export function RebuttalTranslationLine({
  tkey,
  source,
  className
}: {
  tkey: string | null
  source: string
  className?: string
}): React.JSX.Element | null {
  const found = useRebuttalTranslation(tkey, source)
  if (!found) {
    return null
  }
  return (
    <p
      lang={found.language}
      data-translation={tkey}
      className={cn(
        'border-l-2 border-border pl-2 text-xs leading-5 text-muted-foreground',
        className
      )}
    >
      {found.text}
      {found.outdated ? <OutdatedTag /> : null}
    </p>
  )
}

/** A translated reply or review, labelled with its language, under the original. */
export function RebuttalTranslationBlock({
  tkey,
  source,
  className,
  exact = false
}: {
  tkey: string | null
  source: string
  className?: string
  /** Only a translation of exactly this text, e.g. under a suggestion, never an older one. */
  exact?: boolean
}): React.JSX.Element | null {
  const found = useRebuttalTranslation(tkey, source)
  if (!found || (exact && found.outdated)) {
    return null
  }
  return (
    <section
      aria-label={`${found.label} translation`}
      data-translation={tkey}
      className={cn('border-l-2 border-border pl-2.5', className)}
    >
      <p className="text-3xs font-medium text-muted-foreground">
        {found.label}
        {found.outdated ? <OutdatedTag /> : null}
      </p>
      <p
        lang={found.language}
        className="text-sm leading-6 break-words whitespace-pre-wrap text-muted-foreground"
      >
        {found.text}
      </p>
    </section>
  )
}
