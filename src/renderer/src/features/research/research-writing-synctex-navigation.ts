import { useRef, useState } from 'react'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { useAppStore } from '@/store'
import type { WritingPdfSourceLookup } from './ResearchWritingPdfPane'
import { resolveManuscriptFile, type ManuscriptFile } from './research-writing-source'

/** Overleaf-style SyncTeX moves between the TeX and PDF panes, bringing up the pane it lands in. */
export function useWritingSynctexNavigation({
  experiment,
  showPane,
  selectTexFile
}: {
  experiment: ExperimentRecord
  showPane: (pane: 'source' | 'reader') => void
  selectTexFile: (relativePath: string) => void
}): {
  /** PDF → TeX: open the file and put the cursor on the line. */
  jumpToSource: (relativePath: string, line: number) => void
  /** TeX → PDF: ask the PDF pane to scroll to and flash where the line was typeset. */
  showInPdf: (relativePath: string, line: number) => void
  pdfLookup: WritingPdfSourceLookup | null
} {
  const [pdfLookup, setPdfLookup] = useState<WritingPdfSourceLookup | null>(null)
  const nextRequestId = useRef(0)

  function jumpToSource(relativePath: string, line: number): void {
    let file: ManuscriptFile
    try {
      file = resolveManuscriptFile(experiment, relativePath, '.tex')
    } catch {
      return
    }
    selectTexFile(file.relativePath)
    showPane('source')
    useAppStore
      .getState()
      .setPendingEditorReveal({ filePath: file.absolutePath, line, column: 1, matchLength: 0 })
  }

  function showInPdf(relativePath: string, line: number): void {
    showPane('reader')
    nextRequestId.current += 1
    setPdfLookup({ sourcePath: relativePath, line, requestId: nextRequestId.current })
  }

  return { jumpToSource, showInPdf, pdfLookup }
}
