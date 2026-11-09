import type { FigureElement } from './research-figures-model.mjs'

export type FigureRegion = { x: number; y: number; width: number; height: number }
export type FigureFinding = {
  code: string
  id: string | null
  message: string
  /** Stretches of the page the finding is about (empty regions), in scene units. */
  regions?: FigureRegion[]
}
export type FigureNeighbour = {
  id: string
  type: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

export const AREA_NEIGHBOUR_MARGIN: number
/** Rule codes `intentional: true` on an item turns off for it. */
export const INTENTIONAL_CODES: Set<string>
/**
 * Errors print wrong, warnings are style, notes are what the agent cannot fix alone (a page
 * someone else sized: fill it, and suggest a size in the reply).
 */
export function lintFigureScene(
  scene: unknown,
  options?: { area?: string }
): { errors: FigureFinding[]; warnings: FigureFinding[]; notes: FigureFinding[] }
export function areaNeighbours(
  elements: readonly FigureElement[],
  area: { id: string; x: number; y: number; width: number; height: number },
  margin?: number
): FigureNeighbour[]
