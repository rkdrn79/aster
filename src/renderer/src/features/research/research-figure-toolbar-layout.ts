/** The figure toolbar's controls, most important first; the last ones fold into "⋯ More". */
export const TOOLBAR_PRIORITY = [
  'save',
  'ask',
  'generate',
  'paper',
  'export',
  'page',
  'arrange',
  'colors',
  'parts'
] as const

export type ToolbarSlot = (typeof TOOLBAR_PRIORITY)[number]

/**
 * Rendered widths in px at 12 px text, measured in the e2e walk (Generate 80, Ask 46, Use in
 * paper 100, Export 75, the page chip 85), with a little room for longer states. Save is
 * `ResearchFigureSaveButton`, fixed at 144 px so "Saved ✓ · 2s ago" never moves its neighbours.
 */
export const TOOLBAR_WIDTHS: Readonly<Record<ToolbarSlot, number>> = {
  save: 146,
  ask: 48,
  generate: 84,
  paper: 102,
  export: 78,
  page: 92,
  arrange: 36,
  colors: 36,
  parts: 36
}
/** The gap after each control, the two separators with their margins, and the padding. */
const GAP = 4
const CHROME_WIDTH = 42
const MORE_WIDTH = 22 + GAP
const cost = (slot: ToolbarSlot): number => TOOLBAR_WIDTHS[slot] + GAP
/** Export is never folded away: it is how a figure leaves Aster. */
const PINNED: ReadonlySet<ToolbarSlot> = new Set(['export'])

export type ToolbarLayout = { visible: ReadonlySet<ToolbarSlot>; overflow: ToolbarSlot[] }

/**
 * Which controls fit in `available` px (with `extra` px of status chips); the rest fold into
 * More in priority order, so a narrow window loses Parts first and never Export.
 */
export function figureToolbarLayout(available: number, extra = 0): ToolbarLayout {
  const total = TOOLBAR_PRIORITY.reduce((sum, slot) => sum + cost(slot), 0)
  if (!Number.isFinite(available) || available <= 0 || total + extra + CHROME_WIDTH <= available) {
    return { visible: new Set(TOOLBAR_PRIORITY), overflow: [] }
  }
  let room = available - extra - CHROME_WIDTH - MORE_WIDTH
  const visible = new Set<ToolbarSlot>()
  for (const slot of PINNED) {
    visible.add(slot)
    room -= cost(slot)
  }
  let full = false
  for (const slot of TOOLBAR_PRIORITY) {
    if (visible.has(slot)) {
      continue
    }
    // Why stop at the first miss: a lower-priority control must not stay while a higher one folds.
    if (full || cost(slot) > room) {
      full = true
      continue
    }
    visible.add(slot)
    room -= cost(slot)
  }
  return { visible, overflow: TOOLBAR_PRIORITY.filter((slot) => !visible.has(slot)) }
}
