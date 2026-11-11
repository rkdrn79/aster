import type { RebuttalBundle } from './research-rebuttal-model.mjs'
import type { RebuttalFollowUp } from './research-rebuttal-records.mjs'

export type RebuttalTranslation = {
  /** quote:R1-W2, summary:R1-W2, title:C3, reply:C3, reply:opening:R1, reply:general:intro, review:R1… */
  key: string
  language: string
  /** Hash of the text it translates; a different current text makes it outdated. */
  hash: string
  text: string
  at: string
}

export type RebuttalTranslationState = 'current' | 'outdated' | 'missing'

export const MAX_TRANSLATION_CHARS: number
export function translationGroup(key: string): 'concern' | 'reply' | 'review'
export function safeLanguage(value: unknown): string
export function safeTranslationKey(value: unknown): string
export function translationSources(input: {
  meta: RebuttalBundle['meta']
  points: RebuttalBundle['points']
  clusters: RebuttalBundle['clusters']
  reviews: Record<string, string> | undefined
  followUps: readonly RebuttalFollowUp[] | undefined
}): Map<string, string>
export function parseTranslations(value: unknown): RebuttalTranslation[]
export function translationsDocument(translations: RebuttalTranslation[]): {
  schemaVersion: 1
  translations: RebuttalTranslation[]
}
export function withTranslations(
  translations: readonly RebuttalTranslation[],
  incoming: readonly { key: string; hash: string; text: string }[],
  options: { language: string; now: string }
): RebuttalTranslation[]
export function translationFor(
  translations: readonly RebuttalTranslation[],
  key: string,
  language: string,
  source: string
): { text: string; outdated: boolean; at: string } | null
export function translationStatus(
  translations: readonly RebuttalTranslation[],
  sources: Map<string, string>,
  language: string
): { key: string; source: string; hash: string; status: RebuttalTranslationState }[]
