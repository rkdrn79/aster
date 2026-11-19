import {
  WRITING_SKELETON_REQUIRED_LINES,
  type WritingSkeleton
} from '../../../../shared/research/research-writing-results'
import { writingSectionName } from './research-writing-agent-guide'

// What the skeleton card shows and when the person can confirm it.

export type SkeletonField = {
  key: string
  label: string
  /** What the line must say, from the guide's skeleton format. */
  hint: string
  required: boolean
}

const LABELS: Record<string, string> = {
  GAP: 'Gap',
  'WHY-NOT': 'Why not',
  INSIGHT: 'Insight',
  APPROACH: 'Approach',
  EVIDENCE: 'Evidence',
  BUDGET: 'Length budget',
  CONTEXT: 'Context',
  LOSES: 'Where it loses',
  TERM: 'Term',
  VARIANT: 'Variant',
  CONTRIBUTIONS: 'Contributions',
  ORDER: 'Order',
  OMIT: 'Leave out',
  QUESTIONS: 'Questions'
}

const HINTS: Record<string, string> = {
  GAP: 'Who fails at what, and the number, figure or citation that shows it',
  'WHY-NOT': 'The obvious fix, what it solves, and the mechanism by which it fails',
  INSIGHT: 'One sentence: the finding or reframing that explains the gap',
  APPROACH: 'What we do, stated as a consequence of the insight',
  EVIDENCE: '2–3 headline results with numbers and scope, each with a claim'
}

function fieldLabel(key: string): string {
  return LABELS[key] ?? key.charAt(0) + key.slice(1).toLowerCase().replaceAll('-', ' ')
}

/** The five required lines in order, then any optional lines the skeleton has. */
export function skeletonFields(skeleton: WritingSkeleton): SkeletonField[] {
  const required = WRITING_SKELETON_REQUIRED_LINES.map((key) => ({
    key,
    label: fieldLabel(key),
    hint: HINTS[key] ?? '',
    required: true
  }))
  const optional = skeleton.lines
    .filter((line) => !WRITING_SKELETON_REQUIRED_LINES.some((key) => key === line.key))
    .map((line) => ({ key: line.key, label: fieldLabel(line.key), hint: '', required: false }))
  return [...required, ...optional]
}

/** The text of every line as saved. */
export function savedLineTexts(skeleton: WritingSkeleton): Record<string, string> {
  return Object.fromEntries(skeleton.lines.map((line) => [line.key, line.text]))
}

/** The lines the person changed, or null when the card matches the file. */
export function editedLines(
  skeleton: WritingSkeleton,
  drafts: Readonly<Record<string, string>>
): Record<string, string> | null {
  const saved = savedLineTexts(skeleton)
  const changed = Object.entries(drafts).filter(
    ([key, text]) => text.trim() !== (saved[key] ?? '').trim()
  )
  return changed.length ? { ...saved, ...drafts } : null
}

/** Why Confirm is off: the required lines still empty with the card's edits applied. */
export function confirmDisabledReason(
  skeleton: WritingSkeleton,
  drafts: Readonly<Record<string, string>>
): string | null {
  const texts = { ...savedLineTexts(skeleton), ...drafts }
  const empty = WRITING_SKELETON_REQUIRED_LINES.filter((key) => !texts[key]?.trim())
  if (!empty.length) {
    return null
  }
  const names = empty.map((key) => fieldLabel(key))
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
  return `Fill in ${list} first.`
}

function updatedTime(skeleton: WritingSkeleton): number {
  const time = skeleton.updatedAt ? Date.parse(skeleton.updatedAt) : Number.NaN
  return Number.isNaN(time) ? 0 : time
}

/**
 * The skeleton the card asks about: the most recently written draft. A confirmed skeleton the
 * person just confirmed (or opened) stays shown as a one-line row until another draft appears.
 */
export function skeletonToShow(
  skeletons: readonly WritingSkeleton[],
  pinnedPath: string | null
): WritingSkeleton | null {
  const drafts = skeletons
    .filter((skeleton) => skeleton.status === 'draft')
    .sort((left, right) => updatedTime(right) - updatedTime(left))
  return drafts[0] ?? skeletons.find((skeleton) => skeleton.path === pinnedPath) ?? null
}

/** "Introduction skeleton", as the card titles it. */
export function skeletonTitle(skeleton: Pick<WritingSkeleton, 'section'>): string {
  const name = writingSectionName(skeleton.section)
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} skeleton`
}
