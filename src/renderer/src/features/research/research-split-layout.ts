import {
  isResearchWindowPage,
  type ResearchWindowPage
} from '../../../../shared/research-page-window'
import { isResearchSideId, RESEARCH_SPLIT_MAX_SIDES } from '../../../../shared/research-side-split'

/** A project beside the main one: its own project window page, pinned to its workspace. */
export type ResearchSplitSide = {
  id: string
  workspaceId: string
  hostId: string | null
  page: ResearchWindowPage
}

/** The main window's own column, which shows the project the sidebar names. */
export const MAIN_COLUMN = 'main'

/** Narrower than this, a column cannot show a page; the split falls back to tabs. */
export const RESEARCH_SPLIT_MIN_COLUMN_PX = 380

export function equalWeights(count: number): number[] {
  return Array.from({ length: count }, () => 1)
}

/** Weights that still fit `count` columns: kept when they do, evened out when they do not. */
export function fitWeights(weights: readonly number[], count: number): number[] {
  const valid =
    weights.length === count && weights.every((weight) => Number.isFinite(weight) && weight > 0)
  return valid ? [...weights] : equalWeights(count)
}

/**
 * Moves the divider after column `index` by `deltaPx`, trading width between its two neighbours
 * only, and never leaving either narrower than `minPx`.
 */
export function resizeWeights(
  weights: readonly number[],
  index: number,
  deltaPx: number,
  totalPx: number,
  minPx: number = RESEARCH_SPLIT_MIN_COLUMN_PX
): number[] {
  const left = weights[index]
  const right = weights[index + 1]
  const sum = weights.reduce((total, weight) => total + weight, 0)
  if (left === undefined || right === undefined || totalPx <= 0 || sum <= 0) {
    return [...weights]
  }
  const pxPerWeight = totalPx / sum
  const pairPx = (left + right) * pxPerWeight
  if (pairPx < minPx * 2) {
    return [...weights]
  }
  const leftPx = Math.min(Math.max(left * pxPerWeight + deltaPx, minPx), pairPx - minPx)
  const next = [...weights]
  next[index] = leftPx / pxPerWeight
  next[index + 1] = (pairPx - leftPx) / pxPerWeight
  return next
}

/** Whether `columns` columns no longer fit side by side in `widthPx`, so they show as tabs. */
export function isResearchSplitTabbed(widthPx: number, columns: number): boolean {
  return columns > 1 && widthPx > 0 && widthPx < columns * RESEARCH_SPLIT_MIN_COLUMN_PX
}

/** The column after `current`, wrapping round; the main column comes first. */
export function nextResearchSplitColumn(
  sides: readonly Pick<ResearchSplitSide, 'id'>[],
  current: string
): string {
  const order = [MAIN_COLUMN, ...sides.map((side) => side.id)]
  const index = order.indexOf(current)
  return order[(index + 1) % order.length] ?? MAIN_COLUMN
}

export type PersistedResearchSplit = {
  sides: ResearchSplitSide[]
  weights: number[]
  main: { workspaceId: string; hostId: string | null } | null
}

function parseSide(value: unknown): ResearchSplitSide | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const id: unknown = Reflect.get(value, 'id')
  const workspaceId: unknown = Reflect.get(value, 'workspaceId')
  const hostId: unknown = Reflect.get(value, 'hostId')
  const page: unknown = Reflect.get(value, 'page')
  if (
    !isResearchSideId(id) ||
    typeof workspaceId !== 'string' ||
    workspaceId.length === 0 ||
    (hostId !== null && typeof hostId !== 'string') ||
    !isResearchWindowPage(page)
  ) {
    return null
  }
  return { id, workspaceId, hostId, page }
}

/** The split saved for this window, or an empty one when the saved copy is missing or damaged. */
export function parsePersistedResearchSplit(raw: string | null): PersistedResearchSplit {
  const empty: PersistedResearchSplit = { sides: [], weights: [], main: null }
  if (!raw) {
    return empty
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return empty
  }
  if (!value || typeof value !== 'object') {
    return empty
  }
  const rawSides: unknown = Reflect.get(value, 'sides')
  const sides = (Array.isArray(rawSides) ? rawSides : [])
    .map(parseSide)
    .filter((side): side is ResearchSplitSide => side !== null)
    .slice(0, RESEARCH_SPLIT_MAX_SIDES)
  const rawWeights: unknown = Reflect.get(value, 'weights')
  const weights = fitWeights(
    Array.isArray(rawWeights) ? rawWeights.filter((w): w is number => typeof w === 'number') : [],
    sides.length + 1
  )
  const rawMain: unknown = Reflect.get(value, 'main')
  const mainWorkspace: unknown =
    rawMain && typeof rawMain === 'object' ? Reflect.get(rawMain, 'workspaceId') : null
  const mainHost: unknown =
    rawMain && typeof rawMain === 'object' ? Reflect.get(rawMain, 'hostId') : null
  const main =
    typeof mainWorkspace === 'string' &&
    mainWorkspace.length > 0 &&
    (mainHost === null || typeof mainHost === 'string')
      ? { workspaceId: mainWorkspace, hostId: mainHost }
      : null
  return { sides, weights: sides.length > 0 ? weights : [], main: sides.length > 0 ? main : null }
}
