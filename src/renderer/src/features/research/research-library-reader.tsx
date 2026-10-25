/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: the reader reloads PDF bytes whenever the selected paper or its file changes. */
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, FileText, PanelLeft, RefreshCw } from 'lucide-react'
import type { PdfTextSelection } from '@/components/editor/pdf-text-selection'
import type { PdfHighlightOverlay } from '@/components/editor/pdf-highlight-layer'
import type { PdfNavigationRequest } from '@/components/editor/PdfViewer'
import { Button } from '@/components/ui/button'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import type { LibraryPaper, PaperHighlight } from '../../../../shared/research/research-library'
import { HIGHLIGHT_STYLES } from './research-library-paper-records'
import {
  ResearchLibrarySelectionToolbar,
  type ReaderSelectionAction
} from './research-library-selection-toolbar'
import {
  readManuscriptPdf,
  resolveManuscriptFile,
  type ManuscriptFile,
  type ManuscriptPdf
} from './research-writing-source'

const PdfViewer = lazy(() => import('@/components/editor/PdfViewer'))
const MAX_LIBRARY_PDF_BYTES = 64 * 1024 * 1024

export function libraryPaperPdfFile(
  paper: Pick<LibraryPaper, 'pdfPath'> & { scope: Pick<LibraryPaper['scope'], 'workspacePath'> }
): ManuscriptFile | null {
  if (!paper.pdfPath) {
    return null
  }
  try {
    return resolveManuscriptFile(paper.scope, paper.pdfPath, '.pdf')
  } catch {
    return null
  }
}

export function ResearchLibraryReader({
  paper,
  highlights,
  navigation,
  paperListOpen,
  onTogglePaperList,
  onSelectionAction,
  onAttachPdf
}: {
  paper: LibraryPaper
  highlights: readonly PaperHighlight[]
  navigation: PdfNavigationRequest | null
  paperListOpen: boolean
  onTogglePaperList: () => void
  onSelectionAction: (action: ReaderSelectionAction) => Promise<string | null>
  onAttachPdf: (() => Promise<void>) | null
}): React.JSX.Element {
  const [pdf, setPdf] = useState<ManuscriptPdf | null>(null)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selection, setSelection] = useState<PdfTextSelection | null>(null)
  const request = useRef(0)
  const closeSelection = useCallback(() => setSelection(null), [])
  const { hostId, workspaceId, workspacePath } = paper.scope
  const { pdfPath, externalUrl } = paper
  // Why: saving notes replaces the paper object; only a real file change should re-read the PDF.
  const file = useMemo(
    () => libraryPaperPdfFile({ pdfPath, scope: { workspacePath } }),
    [pdfPath, workspacePath]
  )
  const overlays = useMemo<PdfHighlightOverlay[]>(
    () =>
      highlights.map((highlight) => ({
        id: highlight.id,
        pageNumber: highlight.pageNumber,
        rects: highlight.rects,
        color: HIGHLIGHT_STYLES[highlight.color].overlay
      })),
    [highlights]
  )

  useEffect(() => {
    setSelection(null)
  }, [file?.absolutePath, refreshKey])

  useEffect(() => {
    const current = ++request.current
    setPdf(null)
    setPdfError(null)
    if (!file) {
      return
    }
    setLoading(true)
    void readManuscriptPdf(
      { hostId, workspaceId, workspacePath },
      file,
      MAX_LIBRARY_PDF_BYTES
    ).then(
      (nextPdf) => {
        if (request.current === current) {
          setPdf(nextPdf)
          setLoading(false)
        }
      },
      (cause) => {
        if (request.current === current) {
          setPdfError(extractIpcErrorMessage(cause, 'The PDF could not be read.'))
          setLoading(false)
        }
      }
    )
    return () => {
      request.current += 1
    }
  }, [hostId, workspaceId, workspacePath, file, refreshKey])

  return (
    <section aria-label="Paper reader" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-2">
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={paperListOpen ? 'Hide paper list' : 'Show paper list'}
          aria-pressed={paperListOpen}
          onClick={onTogglePaperList}
        >
          <PanelLeft aria-hidden />
        </Button>
        <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {/* Why one clipped line: the hint wraps out of sight before the title has to truncate. */}
        <div className="flex h-4 min-w-0 flex-1 flex-wrap items-center gap-x-3 overflow-hidden text-2xs leading-4 text-muted-foreground">
          <span
            className="min-w-0 flex-auto truncate"
            title={file ? `${paper.title}\n${file.relativePath}` : undefined}
          >
            {file ? paper.title : 'No PDF attached'}
          </span>
          {pdf ? (
            <span className="whitespace-nowrap">
              Select text to explain, translate, ask, or highlight
            </span>
          ) : null}
        </div>
        {file ? (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Reload PDF"
            disabled={loading}
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            <RefreshCw aria-hidden />
          </Button>
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1">
        {pdf && file ? (
          <Suspense
            fallback={<p className="p-6 text-sm text-muted-foreground">Loading PDF viewer…</p>}
          >
            <PdfViewer
              content={pdf.base64}
              filePath={file.absolutePath}
              preferenceKey={`library:${workspaceId}:${file.relativePath}`}
              scrollCacheKey={`library:${workspaceId}:${file.relativePath}`}
              onTextSelection={setSelection}
              highlights={overlays}
              navigation={navigation}
            />
          </Suspense>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <FileText className="size-7 text-muted-foreground" aria-hidden />
            <p className="max-w-sm text-sm text-muted-foreground">
              {loading
                ? 'Reading PDF…'
                : pdfError
                  ? pdfError
                  : file
                    ? 'PDF preview unavailable. Reload or check the file.'
                    : 'Attach the paper’s PDF to read it here with highlights and the reading agent.'}
            </p>
            {!loading && !file ? (
              <div className="flex flex-wrap justify-center gap-2">
                {onAttachPdf ? (
                  <Button size="sm" variant="outline" onClick={() => void onAttachPdf()}>
                    Attach PDF
                  </Button>
                ) : null}
                {externalUrl ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void window.api.shell.openUrl(externalUrl)}
                  >
                    <ExternalLink aria-hidden /> Open source
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
        {selection ? (
          <ResearchLibrarySelectionToolbar
            key={`${selection.pageNumber}:${selection.text}`}
            selection={selection}
            onAction={onSelectionAction}
            onClose={closeSelection}
          />
        ) : null}
      </div>
    </section>
  )
}
