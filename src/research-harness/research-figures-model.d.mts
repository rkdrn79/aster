export const FIGURE_UNITS_PER_INCH: number
export const FIGURE_UNITS_PER_POINT: number
export const PAGE_FRAME_ID: 'figure-page'
export const FIGURE_SCENE_EXTENSION: '.excalidraw'

export type FigureSize = { widthIn: number; heightIn: number }
export const FIGURE_SIZES: Record<'single' | 'double', FigureSize & { label: string }>
export const DOUBLE_COLUMN_MAX_HEIGHT_IN: number
export const PAPER_STYLE: {
  strokeColor: string
  backgroundColor: string
  fillStyle: 'solid'
  strokeWidth: number
  strokeStyle: 'solid'
  roughness: number
  opacity: number
  fontFamily: number
  fontSize: number
}

/** The fields Aster reads from an Excalidraw element; the rest pass through untouched. */
export type FigureElement = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
  frameId?: string | null
  text?: string
  name?: string | null
  boundElements?: readonly { id: string; type: string }[] | null
  customData?: Record<string, unknown>
  [key: string]: unknown
}

export type FigureScene = {
  type: 'excalidraw'
  version: number
  source: string
  elements: FigureElement[]
  appState: Record<string, unknown>
  files: Record<string, unknown>
}

export type FigureFolderListing = {
  figures: { slug: string; svg: boolean; pdf: boolean; png: boolean }[]
  others: { name: string; kind: 'image' | 'pdf' }[]
}

export type FigurePage = FigureSize & {
  id: string
  /** Project-relative reference image when the figure recreates one; null otherwise. */
  reference: string | null
  /** The figure's colour preset (graphite, slate, …) and accent; null for the defaults. */
  style: string | null
  accent: string | null
  /** The illustrative style's panel tints (rose, teal, …); null for the defaults. */
  panels?: string[] | null
  /**
   * Who chose the style: the person (set on the page), the agent (`fig.style`), or null when
   * nobody did and Aster's default applies.
   */
  styleBy?: 'person' | 'agent' | null
  /**
   * Who sized the page: the agent (`figures new`, `fig.setPage`), or the person (in Aster, or
   * Aster's default), whom the agent asks before resizing.
   */
  sizeBy?: 'person' | 'agent'
  x: number
  y: number
  width: number
  height: number
}

export type FigureArea = {
  id: string
  name: string
  prompt: string
  x: number
  y: number
  width: number
  height: number
  children: number
}

export type FigureElementSummary = {
  id: string
  type: string
  label: string
  frameId: string | null
}

export function figureSlug(name: string): string
export function isFigureSlug(value: unknown): value is string
export function figuresFolderFor(manuscriptSource: string): string
export function figureFilePaths(
  folder: string,
  slug: string
): { scene: string; svg: string; pdf: string; png: string; script: string }
export function referenceRegionsPath(referencePath: string): string
export function figurePreviewPaths(
  recordRoot: string,
  slug: string
): {
  directory: string
  png: string
  sidecar: string
  compare: string
  overlay: string
  print: string
  lint: string
}
export function listFigureFolder(
  entries: readonly { name: string; isDirectory: boolean }[]
): FigureFolderListing
export function figureElement(
  type: string,
  props?: Record<string, unknown>,
  random?: () => number
): FigureElement
export function figureSizeLabel(widthIn: number, heightIn: number): string
export function pageFrameElement(
  widthIn: number,
  heightIn: number,
  random?: () => number,
  style?: string | null
): FigureElement
export function newFigureScene(
  size: FigureSize | null,
  random?: () => number,
  style?: string | null
): FigureScene
export function figurePage(elements: readonly FigureElement[]): FigurePage | null
export function figureAreas(elements: readonly FigureElement[]): FigureArea[]
export function elementLabel(element: FigureElement, elements: readonly FigureElement[]): string
export function elementsTouching(
  elements: readonly FigureElement[],
  area: { id?: string; x: number; y: number; width: number; height: number }
): FigureElementSummary[]
export function shortAreaName(prompt: string): string
export function checkFigureScene(value: unknown): string[]
/** Drops elements whose geometry is not numbers (and what pointed at them); `repairs` names them. */
export function repairFigureScene<T>(value: T): { scene: T; repairs: string[] }
export function figureLatexSnippet(input: {
  slug: string
  widthIn?: number | null
  caption?: string
}): string
