import { useEffect, useState } from 'react'
import type { PdfTextSelection } from '@/components/editor/pdf-text-selection'
import type { PdfRevisionLocation } from './research-writing-pdf-agent-send'

// Why typeof: a renderer reloaded before Aster restarts can run against an older preload.
function canFindSource(selection: PdfTextSelection): boolean {
  return (
    Boolean(selection.pdfRects?.length) &&
    typeof window.api.researchSynctex?.sourceRanges === 'function'
  )
}

/** SyncTeX line ranges behind a PDF selection: 'finding' while asked, null when unknown. */
export function useWritingPdfSourceLocation(
  experimentId: string,
  pdfPath: string,
  selection: PdfTextSelection,
  enabled = true
): PdfRevisionLocation | 'finding' | null {
  const [location, setLocation] = useState<PdfRevisionLocation | 'finding' | null>(() =>
    enabled && canFindSource(selection) ? 'finding' : null
  )
  useEffect(() => {
    const rects = selection.pdfRects
    if (!enabled || !rects || !canFindSource(selection)) {
      setLocation(null)
      return
    }
    let live = true
    setLocation('finding')
    window.api.researchSynctex
      .sourceRanges({ experimentId, pdfPath, pageNumber: selection.pageNumber, rects })
      .then(
        (result) => {
          if (live) {
            setLocation(
              result.status === 'ok' ? { ranges: result.ranges, stale: result.stale } : null
            )
          }
        },
        () => {
          if (live) {
            setLocation(null)
          }
        }
      )
    return () => {
      live = false
    }
  }, [enabled, experimentId, pdfPath, selection])
  return location
}
