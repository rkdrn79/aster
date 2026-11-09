import { FIGURE_UNITS_PER_INCH } from '../../../../research-harness/research-figures-model.mjs'

export type PageWidthPreset = { id: string; label: string; widthIn: number }

export const PAGE_WIDTHS: readonly PageWidthPreset[] = [
  { id: 'single', label: 'Single', widthIn: 3.25 },
  { id: 'onehalf', label: '1.5-col', widthIn: 5 },
  { id: 'double', label: 'Double', widthIn: 6.75 }
]

/** Column and text widths of the venues people submit to, in inches. */
export const PAGE_VENUES: readonly {
  id: string
  label: string
  single: number | null
  double: number
}[] = [
  { id: 'icml', label: 'ICML', single: 3.25, double: 6.75 },
  { id: 'cvpr', label: 'CVPR', single: 3.25, double: 6.875 },
  { id: 'acl', label: 'ACL', single: 3.03, double: 6.3 },
  { id: 'neurips', label: 'NeurIPS', single: null, double: 5.5 },
  { id: 'arxiv', label: 'arXiv', single: null, double: 6.5 }
]

/** Wider than a column: the paper sets it as `figure*` across both. */
export const FULL_WIDTH_FROM_IN = 3.5
/** A full-width figure taller than this eats a third of a page. */
export const FULL_WIDTH_MAX_HEIGHT_IN = 2.8
/** Recreate suggests a cap when the reference's shape would make the page taller than this. */
export const RECREATE_HEIGHT_CAP_IN = 4

const round2 = (value: number): number => Math.round(value * 100) / 100

export function formatInches(value: number): string {
  return String(round2(value))
}

export function pageSizeText(widthIn: number, heightIn: number): string {
  return `${formatInches(widthIn)} × ${formatInches(heightIn)} in`
}

/** A size typed in inches, or null when it is not a usable page size. */
export function parseInches(value: string): number | null {
  const number = Number(value.trim())
  return Number.isFinite(number) && number >= 0.5 && number <= 20 ? round2(number) : null
}

/** Why a page size will look wrong in the paper; null when it is fine. */
export function pageSizeWarning(widthIn: number, heightIn: number): string | null {
  return widthIn > FULL_WIDTH_FROM_IN && heightIn > FULL_WIDTH_MAX_HEIGHT_IN + 0.005
    ? `Tall for a full-width figure (${formatInches(heightIn)} in); keep it under ${FULL_WIDTH_MAX_HEIGHT_IN} in.`
    : null
}

export type PageBox = { id: string; x: number; y: number; width: number; height: number }

/** The parts of an Excalidraw element that page changes read and move. */
export type PageElement = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
  points?: readonly (readonly [number, number])[]
}

export type ElementPatch = {
  id: string
  x?: number
  y?: number
  width?: number
  height?: number
  points?: [number, number][]
}

function bounds(element: PageElement): { minX: number; minY: number; maxX: number; maxY: number } {
  if (element.points?.length) {
    const xs = element.points.map((point) => element.x + point[0])
    const ys = element.points.map((point) => element.y + point[1])
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    }
  }
  return {
    minX: element.x,
    minY: element.y,
    maxX: element.x + element.width,
    maxY: element.y + element.height
  }
}

/** Elements drawn on the page: everything whose centre lies inside it, but the page itself. */
export function pageContent<T extends PageElement>(elements: readonly T[], page: PageBox): T[] {
  return elements.filter((element) => {
    if (element.isDeleted || element.id === page.id) {
      return false
    }
    const box = bounds(element)
    const cx = (box.minX + box.maxX) / 2
    const cy = (box.minY + box.maxY) / 2
    return cx >= page.x && cx <= page.x + page.width && cy >= page.y && cy <= page.y + page.height
  })
}

/**
 * Moves the page to `next` (inches). `keep` leaves every element its size and keeps the
 * drawing centred across the new width; `scale` scales positions and shapes with the width but
 * keeps text at its point size, each label centred where its box went.
 */
export function pageResizePatches(
  elements: readonly PageElement[],
  page: PageBox,
  next: { widthIn: number; heightIn: number },
  mode: 'keep' | 'scale'
): ElementPatch[] {
  const width = Math.round(next.widthIn * FIGURE_UNITS_PER_INCH)
  const height = Math.round(next.heightIn * FIGURE_UNITS_PER_INCH)
  const content = pageContent(elements, page)
  const frame: ElementPatch = { id: page.id, width, height }
  if (mode === 'keep') {
    const dx = Math.round((width - page.width) / 2)
    return [frame, ...(dx ? content.map((element) => ({ id: element.id, x: element.x + dx })) : [])]
  }
  const scale = width / page.width
  const sx = (value: number): number => page.x + (value - page.x) * scale
  const sy = (value: number): number => page.y + (value - page.y) * scale
  return [
    frame,
    ...content.map((element): ElementPatch => {
      if (element.type === 'text') {
        return {
          id: element.id,
          x: sx(element.x + element.width / 2) - element.width / 2,
          y: sy(element.y + element.height / 2) - element.height / 2
        }
      }
      return {
        id: element.id,
        x: sx(element.x),
        y: sy(element.y),
        width: element.width * scale,
        height: element.height * scale,
        ...(element.points
          ? {
              points: element.points.map((point): [number, number] => [
                point[0] * scale,
                point[1] * scale
              ])
            }
          : {})
      }
    })
  ]
}

/** The page's top and height that hug the drawing with `margin` units around it; null if empty. */
export function fitPageToContent(
  elements: readonly PageElement[],
  page: PageBox,
  margin = 12
): { y: number; height: number; heightIn: number } | null {
  const content = pageContent(elements, page)
  if (!content.length) {
    return null
  }
  const boxes = content.map(bounds)
  const top = Math.min(...boxes.map((box) => box.minY)) - margin
  const bottom = Math.max(...boxes.map((box) => box.maxY)) + margin
  const heightIn = Math.max(0.5, round2((bottom - top) / FIGURE_UNITS_PER_INCH))
  return { y: Math.round(top), height: Math.round(heightIn * FIGURE_UNITS_PER_INCH), heightIn }
}

/** The height Recreate gives the page for the reference's shape, and whether to cap it. */
export function recreatePageHeight(
  widthIn: number,
  pixels: { width: number; height: number }
): { heightIn: number; tall: boolean } {
  const heightIn = round2((widthIn * pixels.height) / pixels.width)
  return { heightIn, tall: heightIn > RECREATE_HEIGHT_CAP_IN }
}
