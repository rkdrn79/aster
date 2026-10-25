export type WritingPaneRatios = readonly [number, number, number]
export type WritingPaneVisibility = readonly [boolean, boolean, boolean]
export type WritingPaneIndex = 0 | 1 | 2
export type WritingPaneOrder = readonly [WritingPaneIndex, WritingPaneIndex, WritingPaneIndex]

export const DEFAULT_WRITING_PANE_RATIOS: WritingPaneRatios = [0.24, 0.38, 0.38]
export const DEFAULT_WRITING_PANE_VISIBILITY: WritingPaneVisibility = [true, true, true]
export const DEFAULT_WRITING_PANE_ORDER: WritingPaneOrder = [0, 1, 2]

const HANDLE_WIDTH = 6
const MIN_WIDTHS = [200, 420, 260] as const
const STORAGE_PREFIX = 'aster.research-writing-pane-ratios.v1:'
const VISIBILITY_STORAGE_PREFIX = 'aster.research-writing-pane-visibility.v1:'
const ORDER_STORAGE_PREFIX = 'aster.research-writing-pane-order.v1:'

export const WRITING_PANE_NARROWEST_WIDTH = Math.min(...MIN_WIDTHS)

/** Width the shown panes need at their minimums; the narrow layout shows one pane at a time. */
export function writingPanesMinimumWidth(visibility: WritingPaneVisibility, wide: boolean): number {
  if (!wide) {
    return Math.max(...MIN_WIDTHS)
  }
  const indexes = visibleWritingPaneIndexes(visibility)
  return indexes.reduce<number>(
    (sum, index) => sum + MIN_WIDTHS[index],
    HANDLE_WIDTH * (indexes.length - 1)
  )
}

export function visibleWritingPaneIndexes(
  visibility: WritingPaneVisibility,
  order: WritingPaneOrder = DEFAULT_WRITING_PANE_ORDER
): WritingPaneIndex[] {
  return order.filter((index) => visibility[index])
}

export function writingPaneDividerPair(
  visibility: WritingPaneVisibility,
  divider: 0 | 1,
  order: WritingPaneOrder = DEFAULT_WRITING_PANE_ORDER
): readonly [WritingPaneIndex, WritingPaneIndex] | null {
  const indexes = visibleWritingPaneIndexes(visibility, order)
  const first = indexes[divider]
  const second = indexes[divider + 1]
  return first === undefined || second === undefined ? null : [first, second]
}

export function writingPaneGridColumns(
  ratios: WritingPaneRatios,
  visibility: WritingPaneVisibility = DEFAULT_WRITING_PANE_VISIBILITY,
  order: WritingPaneOrder = DEFAULT_WRITING_PANE_ORDER
): string {
  const indexes = visibleWritingPaneIndexes(visibility, order)
  const total = indexes.reduce<number>((sum, index) => sum + ratios[index], 0)
  return indexes.map((index) => `minmax(0, ${ratios[index] / total}fr)`).join(` ${HANDLE_WIDTH}px `)
}

export function resizeWritingPaneRatios(
  ratios: WritingPaneRatios,
  divider: 0 | 1,
  deltaPixels: number,
  containerWidth: number,
  visibility: WritingPaneVisibility = DEFAULT_WRITING_PANE_VISIBILITY,
  order: WritingPaneOrder = DEFAULT_WRITING_PANE_ORDER
): WritingPaneRatios {
  const indexes = visibleWritingPaneIndexes(visibility, order)
  const pair = writingPaneDividerPair(visibility, divider, order)
  if (!pair) {
    return ratios
  }
  const [firstIndex, secondIndex] = pair
  const contentWidth = containerWidth - HANDLE_WIDTH * (indexes.length - 1)
  if (!Number.isFinite(deltaPixels) || !Number.isFinite(contentWidth) || contentWidth <= 0) {
    return ratios
  }
  const visibleTotal = indexes.reduce<number>((sum, index) => sum + ratios[index], 0)
  const minimumTotal = indexes.reduce<number>((sum, index) => sum + MIN_WIDTHS[index], 0)
  const scale = Math.min(1, contentWidth / minimumTotal)
  const pairTotal = ratios[firstIndex] + ratios[secondIndex]
  const minimumFirst = ((MIN_WIDTHS[firstIndex] * scale) / contentWidth) * visibleTotal
  const minimumSecond = ((MIN_WIDTHS[secondIndex] * scale) / contentWidth) * visibleTotal
  if (pairTotal < minimumFirst + minimumSecond) {
    const first = (pairTotal * minimumFirst) / (minimumFirst + minimumSecond)
    return replacePairRatios(ratios, firstIndex, secondIndex, first, pairTotal - first)
  }
  const first = Math.min(
    pairTotal - minimumSecond,
    Math.max(minimumFirst, ratios[firstIndex] + (deltaPixels / contentWidth) * visibleTotal)
  )
  return replacePairRatios(ratios, firstIndex, secondIndex, first, pairTotal - first)
}

export function constrainWritingPaneRatios(
  ratios: WritingPaneRatios,
  containerWidth: number,
  visibility: WritingPaneVisibility = DEFAULT_WRITING_PANE_VISIBILITY
): WritingPaneRatios {
  const indexes = visibleWritingPaneIndexes(visibility)
  const contentWidth = containerWidth - HANDLE_WIDTH * (indexes.length - 1)
  if (!Number.isFinite(contentWidth) || contentWidth <= 0 || indexes.length < 2) {
    return ratios
  }
  const visibleTotal = indexes.reduce<number>((sum, index) => sum + ratios[index], 0)
  const minimumTotal = indexes.reduce<number>((sum, index) => sum + MIN_WIDTHS[index], 0)
  const scale = Math.min(1, contentWidth / minimumTotal)
  const minimums = MIN_WIDTHS.map((width, index) =>
    visibility[index] ? ((width * scale) / contentWidth) * visibleTotal : 0
  )
  const deficit = indexes.reduce<number>(
    (sum, index) => sum + Math.max(0, minimums[index] - ratios[index]),
    0
  )
  if (deficit < 0.000001) {
    return ratios
  }
  const surplus = indexes.reduce<number>(
    (sum, index) => sum + Math.max(0, ratios[index] - minimums[index]),
    0
  )
  if (surplus <= 0) {
    return ratios
  }
  const value = (index: 0 | 1 | 2): number => {
    if (!visibility[index]) {
      return ratios[index]
    }
    return ratios[index] < minimums[index]
      ? minimums[index]
      : ratios[index] - (deficit * (ratios[index] - minimums[index])) / surplus
  }
  return [value(0), value(1), value(2)]
}

function replacePairRatios(
  ratios: WritingPaneRatios,
  firstIndex: 0 | 1 | 2,
  secondIndex: 0 | 1 | 2,
  first: number,
  second: number
): WritingPaneRatios {
  return [
    firstIndex === 0 ? first : secondIndex === 0 ? second : ratios[0],
    firstIndex === 1 ? first : secondIndex === 1 ? second : ratios[1],
    firstIndex === 2 ? first : secondIndex === 2 ? second : ratios[2]
  ]
}

function validRatios(value: unknown): WritingPaneRatios | null {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((item) => typeof item === 'number' && Number.isFinite(item) && item > 0)
  ) {
    return null
  }
  const total = value[0] + value[1] + value[2]
  if (Math.abs(total - 1) > 0.01) {
    return null
  }
  return [value[0] / total, value[1] / total, value[2] / total]
}

export function readWritingPaneRatios(experimentId: string): WritingPaneRatios {
  try {
    return (
      validRatios(JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${experimentId}`) ?? 'null')) ??
      DEFAULT_WRITING_PANE_RATIOS
    )
  } catch {
    return DEFAULT_WRITING_PANE_RATIOS
  }
}

export function saveWritingPaneRatios(experimentId: string, ratios: WritingPaneRatios): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${experimentId}`, JSON.stringify(ratios))
  } catch {
    // Layout remains usable when browser storage is unavailable.
  }
}

export function readWritingPaneVisibility(experimentId: string): WritingPaneVisibility {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(`${VISIBILITY_STORAGE_PREFIX}${experimentId}`) ?? 'null'
    )
    if (
      Array.isArray(stored) &&
      stored.length === 3 &&
      stored.every((item) => typeof item === 'boolean') &&
      stored.some(Boolean)
    ) {
      return [stored[0], stored[1], stored[2]]
    }
  } catch {
    // Use a complete layout when browser storage is unavailable or malformed.
  }
  return DEFAULT_WRITING_PANE_VISIBILITY
}

export function saveWritingPaneVisibility(
  experimentId: string,
  visibility: WritingPaneVisibility
): void {
  try {
    localStorage.setItem(`${VISIBILITY_STORAGE_PREFIX}${experimentId}`, JSON.stringify(visibility))
  } catch {
    // Pane toggles remain usable when browser storage is unavailable.
  }
}

export function toggleWritingPaneVisibility(
  visibility: WritingPaneVisibility,
  index: 0 | 1 | 2
): WritingPaneVisibility {
  if (visibility[index] && visibleWritingPaneIndexes(visibility).length === 1) {
    return visibility
  }
  return [
    index === 0 ? !visibility[0] : visibility[0],
    index === 1 ? !visibility[1] : visibility[1],
    index === 2 ? !visibility[2] : visibility[2]
  ]
}

export function readWritingPaneOrder(experimentId: string): WritingPaneOrder {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(`${ORDER_STORAGE_PREFIX}${experimentId}`) ?? 'null'
    )
    if (
      Array.isArray(stored) &&
      stored.length === 3 &&
      stored.every((value) => value === 0 || value === 1 || value === 2) &&
      new Set(stored).size === 3
    ) {
      return [stored[0], stored[1], stored[2]]
    }
  } catch {
    // Use the default order when browser storage is unavailable or malformed.
  }
  return DEFAULT_WRITING_PANE_ORDER
}

export function saveWritingPaneOrder(experimentId: string, order: WritingPaneOrder): void {
  try {
    localStorage.setItem(`${ORDER_STORAGE_PREFIX}${experimentId}`, JSON.stringify(order))
  } catch {
    // Reordering remains usable when browser storage is unavailable.
  }
}

export function swapWritingPaneOrder(
  order: WritingPaneOrder,
  first: WritingPaneIndex,
  second: WritingPaneIndex
): WritingPaneOrder {
  if (first === second) {
    return order
  }
  const swap = (index: WritingPaneIndex): WritingPaneIndex =>
    index === first ? second : index === second ? first : index
  return [swap(order[0]), swap(order[1]), swap(order[2])]
}
