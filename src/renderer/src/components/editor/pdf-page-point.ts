import type { PdfPageRect, PdfPointRect } from './pdf-text-selection'

/** A spot on a PDF page in PDF points, measured from the page's top-left corner. */
export type PdfPagePoint = { pageNumber: number; x: number; y: number }

export type PdfPageViewGeometry = {
  div: HTMLElement
  viewport: {
    viewBox: number[]
    width: number
    height: number
    convertToPdfPoint: (x: number, y: number) => number[]
    convertToViewportPoint: (x: number, y: number) => number[]
  }
}

type PdfPageViews = { getPageView: (index: number) => PdfPageViewGeometry | undefined }

/** Uses pdf.js's own viewport transform, so zoom, rotation and crop boxes stay correct. */
function pointOnPage(
  view: PdfPageViewGeometry,
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  const rect = view.div.getBoundingClientRect()
  // Why clientLeft/Top: the page div's border sits outside the viewport the transform maps.
  const [pdfX, pdfY] = view.viewport.convertToPdfPoint(
    clientX - rect.left - view.div.clientLeft,
    clientY - rect.top - view.div.clientTop
  )
  const [left, , , top] = view.viewport.viewBox
  if (!Number.isFinite(pdfX) || !Number.isFinite(pdfY)) {
    return null
  }
  return { x: pdfX - left, y: top - pdfY }
}

export function pdfPagePointAt(
  viewer: PdfPageViews,
  target: Element,
  clientX: number,
  clientY: number
): PdfPagePoint | null {
  const page = target.closest('.page[data-page-number]')
  const pageNumber = Number(page?.getAttribute('data-page-number'))
  const view = page && pageNumber >= 1 ? viewer.getPageView(pageNumber - 1) : undefined
  const point =
    view && Number.isSafeInteger(pageNumber) ? pointOnPage(view, clientX, clientY) : null
  return point ? { pageNumber, ...point } : null
}

/** Selection line boxes (fractions of the page's border box) in PDF points. */
export function pdfPointRectsOf(
  viewer: PdfPageViews,
  pageNumber: number,
  rects: readonly PdfPageRect[]
): PdfPointRect[] {
  const view = viewer.getPageView(pageNumber - 1)
  if (!view) {
    return []
  }
  const box = view.div.getBoundingClientRect()
  return rects.flatMap((rect) => {
    const a = pointOnPage(view, box.left + rect.x * box.width, box.top + rect.y * box.height)
    const b = pointOnPage(
      view,
      box.left + (rect.x + rect.width) * box.width,
      box.top + (rect.y + rect.height) * box.height
    )
    return a && b
      ? [
          {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.abs(b.x - a.x),
            height: Math.abs(b.y - a.y)
          }
        ]
      : []
  })
}

/** PDF-point boxes as fractions of the rendered page, the way the highlight layer draws them. */
export function pdfPageRectsOf(
  view: PdfPageViewGeometry,
  boxes: readonly PdfPointRect[]
): PdfPageRect[] {
  const { viewport } = view
  const [left, , , top] = viewport.viewBox
  if (!(viewport.width > 0) || !(viewport.height > 0)) {
    return []
  }
  return boxes.map((box) => {
    const [ax, ay] = viewport.convertToViewportPoint(left + box.x, top - box.y)
    const [bx, by] = viewport.convertToViewportPoint(
      left + box.x + box.width,
      top - box.y - box.height
    )
    return {
      x: Math.min(ax, bx) / viewport.width,
      y: Math.min(ay, by) / viewport.height,
      width: Math.abs(bx - ax) / viewport.width,
      height: Math.abs(by - ay) / viewport.height
    }
  })
}
