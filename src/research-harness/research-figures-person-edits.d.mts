import type { FigureElement } from './research-figures-model.mjs'

export const PERSON_EDITS_VERSION: number
export const PERSON_STYLE_PROPS: readonly string[]
export const PERSON_EDIT_PROPS: readonly string[]

/** One property the person set: the value the agent's script drew, and theirs. */
export type PersonPropEdit = { from: unknown; to: unknown; follows?: boolean }
export type PersonEdit = {
  id: string
  label?: string
  at?: string
  set?: Record<string, PersonPropEdit>
  removed?: boolean
  added?: { element: FigureElement; file?: unknown; fileTooLarge?: boolean }
}
export type PersonEdits = { version: number; edits: PersonEdit[] }
export type PersonEditItem = { id: string; label: string }
export type PersonEditOverride = PersonEditItem & { prop: string; agent: unknown; person: unknown }
export type PersonEditApplyReport = {
  kept: PersonEditItem[]
  overrode: PersonEditOverride[]
  gone: PersonEditItem[]
  restored: PersonEditItem[]
  removed: PersonEditItem[]
}

export function emptyPersonEdits(): PersonEdits
export function parsePersonEdits(value: unknown): PersonEdits
export function readPersonProp(element: FigureElement, prop: string): unknown
export function comparablePersonValue(prop: string, value: unknown): unknown
export function personPropsFor(element: FigureElement): string[]
export function personEditLabel(element: FigureElement, elements: readonly FigureElement[]): string
export function recordPersonEdits(
  ledger: PersonEdits | null,
  input: {
    before: readonly FigureElement[]
    after: readonly FigureElement[]
    files?: Record<string, unknown>
    touched?: Iterable<string> | null
    at?: string
  }
): PersonEdits
export function prunePersonEdits(
  ledger: PersonEdits | null,
  elements: readonly FigureElement[]
): PersonEdits
export function releasePersonEdits(
  ledger: PersonEdits | null,
  targets: readonly string[]
): { ledger: PersonEdits; unknown: string[] }
export function applyPersonEdits(
  scene: { elements: FigureElement[]; files?: Record<string, unknown> },
  ledger: PersonEdits | null,
  options?: { random?: () => number }
): { changed: boolean; report: PersonEditApplyReport }
