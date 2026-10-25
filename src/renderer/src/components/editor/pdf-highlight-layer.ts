import type { EventBus, PDFViewer } from 'pdfjs-dist/web/pdf_viewer.mjs'
import type { PdfPageRect } from './pdf-text-selection'

export type PdfHighlightOverlay = {
  id: string
  pageNumber: number
  rects: readonly PdfPageRect[]
  /** Any CSS color; drawn with multiply so the page text stays legible. */
  color: string
}

const LAYER_CLASS = 'aster-pdf-highlight-layer'

function paintPage(pageDiv: HTMLElement, highlights: readonly PdfHighlightOverlay[]): void {
  let layer = pageDiv.querySelector<HTMLDivElement>(`:scope > .${LAYER_CLASS}`)
  if (highlights.length === 0) {
    layer?.remove()
    return
  }
  if (!layer) {
    layer = document.createElement('div')
    layer.className = LAYER_CLASS
    // Why: above the transparent text layer but click-through, so selection keeps working.
    Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
    pageDiv.append(layer)
  }
  layer.replaceChildren(
    ...highlights.flatMap((highlight) =>
      highlight.rects.map((rect) => {
        const mark = document.createElement('div')
        mark.dataset.highlightId = highlight.id
        Object.assign(mark.style, {
          position: 'absolute',
          left: `${rect.x * 100}%`,
          top: `${rect.y * 100}%`,
          width: `${rect.width * 100}%`,
          height: `${rect.height * 100}%`,
          background: highlight.color,
          mixBlendMode: 'multiply',
          borderRadius: '2px'
        })
        return mark
      })
    )
  )
}

/** pdf.js clears unknown page children on every re-render, so marks are redrawn per render. */
export function attachPdfHighlightLayer(
  viewer: PDFViewer,
  eventBus: EventBus,
  getHighlights: () => readonly PdfHighlightOverlay[]
): { repaint: () => void; dispose: () => void } {
  const forPage = (pageNumber: number): PdfHighlightOverlay[] =>
    getHighlights().filter((highlight) => highlight.pageNumber === pageNumber)
  const onPageRendered = (event: { pageNumber: number; source: { div: HTMLElement } }): void => {
    paintPage(event.source.div, forPage(event.pageNumber))
  }
  eventBus.on('pagerendered', onPageRendered)
  return {
    repaint: () => {
      for (let index = 0; index < viewer.pagesCount; index += 1) {
        const div = viewer.getPageView(index)?.div
        if (div) {
          paintPage(div, forPage(index + 1))
        }
      }
    },
    dispose: () => eventBus.off('pagerendered', onPageRendered)
  }
}
