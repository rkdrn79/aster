import type {
  PersonEdit,
  PersonEditItem,
  PersonEditOverride,
  PersonEdits
} from './research-figures-person-edits.mjs'

export type PersonEditWordsReport = {
  count: number
  kept: string[]
  gone: string[]
  overrode: string[]
}

export function personEditWords(entry: PersonEdit): string[]
export function visiblePersonEdits(ledger: PersonEdits | null): PersonEdit[]
export function personEditLine(entry: PersonEdit): string
export function personEditReport(
  ledger: PersonEdits | null,
  input?: { gone?: readonly PersonEditItem[]; overrode?: readonly PersonEditOverride[] }
): PersonEditWordsReport
export function personEditLines(report: PersonEditWordsReport, slug: string): string[]
