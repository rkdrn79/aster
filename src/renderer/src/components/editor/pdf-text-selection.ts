export const MAX_PDF_TEXT_SELECTION_LENGTH = 24_000

/** Fractions of the page box, so a saved rectangle lands in place at any zoom. */
export type PdfPageRect = { x: number; y: number; width: number; height: number }

/** A box in PDF points, measured from the page's top-left corner. */
export type PdfPointRect = { x: number; y: number; width: number; height: number }

export type PdfTextSelection = {
  text: string
  pageNumber: number
  anchor: { x: number; y: number }
  /** Line boxes of the selection on its page; absent when the browser reports none. */
  rects?: PdfPageRect[]
  /** The same line boxes in PDF points, added by a viewer that can map them (SyncTeX lookups). */
  pdfRects?: PdfPointRect[]
}

const MAX_SELECTION_RECTS = 400
// Why: pdf.js's endOfContent filler can join a drag and report a box taller than any text line.
const MAX_LINE_HEIGHT_FRACTION = 0.08

function parentElement(node: Node | null): Element | null {
  return node instanceof Element ? node : (node?.parentElement ?? null)
}

function clampFraction(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** Joins the per-span boxes pdf.js produces into one box per line run. */
function mergeLineRects(rects: PdfPageRect[]): PdfPageRect[] {
  const sorted = [...rects].sort((a, b) => a.y - b.y || a.x - b.x)
  const merged: PdfPageRect[] = []
  for (const rect of sorted) {
    const last = merged.at(-1)
    const sameLine =
      last &&
      Math.abs(last.y + last.height / 2 - (rect.y + rect.height / 2)) <
        Math.min(last.height, rect.height) / 2
    if (last && sameLine && rect.x <= last.x + last.width + 0.01) {
      const right = Math.max(last.x + last.width, rect.x + rect.width)
      const top = Math.min(last.y, rect.y)
      const bottom = Math.max(last.y + last.height, rect.y + rect.height)
      last.width = right - last.x
      last.y = top
      last.height = bottom - top
    } else {
      merged.push({ ...rect })
    }
  }
  return merged
}

function selectionPageRects(page: Element, range: Range): PdfPageRect[] {
  const box = page.getBoundingClientRect()
  if (box.width <= 0 || box.height <= 0) {
    return []
  }
  const rects: PdfPageRect[] = []
  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width < 0.5 || rect.height < 0.5) {
      continue
    }
    const x = clampFraction((rect.left - box.left) / box.width)
    const y = clampFraction((rect.top - box.top) / box.height)
    const width = clampFraction((rect.right - box.left) / box.width) - x
    const height = clampFraction((rect.bottom - box.top) / box.height) - y
    if (width > 0 && height > 0 && height <= MAX_LINE_HEIGHT_FRACTION) {
      rects.push({ x, y, width, height })
    }
  }
  return mergeLineRects(rects).slice(0, MAX_SELECTION_RECTS)
}

/** Accept only real PDF.js text on one page, never viewer chrome or cross-page selections. */
export function extractPdfTextSelection(
  root: HTMLElement,
  selection: Selection | null
): PdfTextSelection | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null
  }
  const anchorLayer = parentElement(selection.anchorNode)?.closest('.textLayer')
  const focusLayer = parentElement(selection.focusNode)?.closest('.textLayer')
  if (!anchorLayer || anchorLayer !== focusLayer || !root.contains(anchorLayer)) {
    return null
  }
  const page = anchorLayer.closest('.page[data-page-number]')
  const pageNumber = Number(page?.getAttribute('data-page-number'))
  if (!page || !Number.isSafeInteger(pageNumber) || pageNumber < 1) {
    return null
  }
  const text = selection.toString().trim()
  if (!text || text.length > MAX_PDF_TEXT_SELECTION_LENGTH) {
    return null
  }
  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  if (!Number.isFinite(rect.right) || !Number.isFinite(rect.bottom)) {
    return null
  }
  const rects = selectionPageRects(page, range)
  return {
    text,
    pageNumber,
    anchor: { x: rect.right, y: rect.bottom },
    ...(rects.length ? { rects } : {})
  }
}
