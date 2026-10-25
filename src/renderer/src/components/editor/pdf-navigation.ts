import type { PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs'
import type { PdfHighlightOverlay } from './pdf-highlight-layer'
import { pdfPageRectsOf, type PdfPageViewGeometry } from './pdf-page-point'
import type { PdfPointRect } from './pdf-text-selection'

/** Each new request object scrolls once; `top` is a fraction of the page height. */
export type PdfNavigationRequest = {
  pageNumber: number
  top?: number
  requestId: number
  /** Boxes in PDF points to scroll to and flash briefly (e.g. a SyncTeX forward search). */
  boxes?: readonly PdfPointRect[]
}

const FLASH_COLOR = 'rgba(250, 204, 21, 0.45)'

/** Scrolls a request into view and returns the highlight to flash for its boxes, if any. */
export function scrollToPdfNavigation(
  viewer: PDFViewer,
  container: HTMLElement,
  request: PdfNavigationRequest
): PdfHighlightOverlay | null {
  const pageNumber = Math.min(Math.max(1, request.pageNumber), viewer.pagesCount)
  viewer.scrollPageIntoView({ pageNumber })
  const view = viewer.getPageView(pageNumber - 1) as PdfPageViewGeometry | undefined
  const rects = view && request.boxes?.length ? pdfPageRectsOf(view, request.boxes) : []
  const top = rects.length ? Math.min(...rects.map((rect) => rect.y)) : request.top
  if (view && top !== undefined) {
    container.scrollTop +=
      view.div.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      top * view.div.clientHeight -
      container.clientHeight * 0.3
  }
  return rects.length
    ? { id: `navigation-${request.requestId}`, pageNumber, rects, color: FLASH_COLOR }
    : null
}
