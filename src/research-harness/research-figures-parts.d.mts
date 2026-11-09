import type { FigureElement } from './research-figures-model.mjs'

export const FIGURE_PARTS: readonly {
  id: string
  name: string
  label: string
  hue: string
  bind: string
}[]
export function buildFigurePart(
  name: string,
  options?: {
    x?: number
    y?: number
    label?: string
    frameId?: string | null
    id?: string
    width?: number
    height?: number
    color?: string
    scale?: number
    side?: 'top' | 'bottom' | 'left' | 'right'
    rows?: number
    cols?: number
    symbol?: 'plus' | 'times' | 'dot'
  },
  random?: () => number
): FigureElement[]
export function figureLibraryItems(random?: () => number): {
  id: string
  status: 'published'
  name: string
  created: number
  elements: FigureElement[]
}[]
