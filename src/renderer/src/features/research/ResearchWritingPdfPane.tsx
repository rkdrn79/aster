/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: the PDF reader refreshes bytes after a selected manuscript or build changes. */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Download, FilePenLine, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { Button } from '@/components/ui/button'
import { getIntlLocale } from '@/i18n/i18n'
import { basename } from '@/lib/path'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import type { PdfNavigationRequest } from '@/components/editor/pdf-navigation'
import type { PdfPagePoint } from '@/components/editor/pdf-page-point'
import type { PdfTextSelection } from '@/components/editor/pdf-text-selection'
import { useAppStore } from '@/store'
import {
  readManuscriptPdf,
  resolveManuscriptFile,
  type ManuscriptFile,
  type ManuscriptPdf
} from './research-writing-source'
import { ResearchWritingPdfReviseComposer } from './research-writing-pdf-revise-composer'
import { useWritingCompile } from './research-writing-compile'
import {
  ResearchWritingCompileLogDialog,
  ResearchWritingCompileStatus
} from './ResearchWritingCompileLog'

const PdfViewer = lazy(() => import('@/components/editor/PdfViewer'))

/** A request to show where a TeX line was typeset; each new object is looked up once. */
export type WritingPdfSourceLookup = { sourcePath: string; line: number; requestId: number }

export function ResearchWritingPdfPane({
  experiment,
  projectOnly = false,
  rootFile,
  sourceCandidate,
  visible,
  onSourceJump,
  onOpenSource,
  sourceLookup = null
}: {
  experiment: ExperimentRecord
  /** A project without Experiments: no SyncTeX or Writing chat, compiled by path. */
  projectOnly?: boolean
  rootFile: ManuscriptFile
  sourceCandidate?: ManuscriptFile | null
  visible: boolean
  /** SyncTeX reverse search: a double-click asks to show this TeX file and line. */
  onSourceJump?: (relativePath: string, line: number) => void
  /** Opens a TeX file at a line, e.g. from a build error. */
  onOpenSource?: (relativePath: string, line: number) => void
  /** SyncTeX forward search: scroll to and flash where this TeX line was typeset. */
  sourceLookup?: WritingPdfSourceLookup | null
}): React.JSX.Element {
  const manuscript = experiment.manuscript
  const [pdfLoading, setPdfLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pdf, setPdf] = useState<ManuscriptPdf | null>(null)
  const [pdfRefreshKey, setPdfRefreshKey] = useState(0)
  const [compiledPdfPath, setCompiledPdfPath] = useState<string | null>(null)
  const [lastBuiltAt, setLastBuiltAt] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [pdfSelection, setPdfSelection] = useState<PdfTextSelection | null>(null)
  const [revisionSelection, setRevisionSelection] = useState<PdfTextSelection | null>(null)
  const [navigation, setNavigation] = useState<PdfNavigationRequest | null>(null)
  const pdfReadGeneration = useRef(0)
  const dirtyTeXFiles = useAppStore(
    (state) =>
      state.openFiles.filter(
        (file) =>
          file.worktreeId === experiment.workspaceId &&
          file.relativePath.toLowerCase().endsWith('.tex') &&
          file.isDirty
      ).length
  )
  const build = useWritingCompile({
    record: experiment,
    projectOnly,
    rootFile,
    dirtyTeXFiles,
    onBuilt: (file, builtAt) => {
      setCompiledPdfPath(file.relativePath)
      setLastBuiltAt(builtAt)
      setPdfRefreshKey((value) => value + 1)
    }
  })
  const compiling = build.compiling
  const synctexAvailable = !projectOnly && Boolean(window.api.researchSynctex)
  const pdfFile = useMemo(() => {
    if (!manuscript) {
      return null
    }
    try {
      const path =
        compiledPdfPath ?? manuscript.pdfPath ?? manuscript.sourcePath.replace(/\.tex$/i, '.pdf')
      return resolveManuscriptFile(experiment, path, '.pdf')
    } catch {
      return null
    }
  }, [experiment, manuscript, compiledPdfPath])

  useEffect(() => {
    setCompiledPdfPath(null)
    setLastBuiltAt(null)
  }, [manuscript?.sourcePath])

  useEffect(() => {
    setPdfSelection(null)
    setRevisionSelection(null)
    // Why: a remounted viewer would replay the last forward search on a different build.
    setNavigation(null)
  }, [pdfFile?.absolutePath, pdfRefreshKey])

  useEffect(() => {
    if (!sourceLookup) {
      return
    }
    if (!pdfFile || !synctexAvailable || !window.api.researchSynctex?.pdfAt) {
      toast.message('Compile the PDF first to find this line in it.')
      return
    }
    let live = true
    void window.api.researchSynctex
      .pdfAt({
        experimentId: experiment.id,
        pdfPath: pdfFile.relativePath,
        sourcePath: sourceLookup.sourcePath,
        line: sourceLookup.line
      })
      .then((result) => {
        if (!live) {
          return
        }
        if (result.status === 'ok') {
          setNavigation({
            pageNumber: result.pageNumber,
            boxes: result.boxes,
            requestId: sourceLookup.requestId
          })
        } else {
          toast.message(result.message)
        }
      })
    return () => {
      live = false
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- each request is looked up once; a rebuilt PDF must not replay an older one.
  }, [sourceLookup])

  useEffect(() => {
    const generation = ++pdfReadGeneration.current
    if (!pdfFile) {
      setPdf(null)
      return
    }
    setPdfLoading(true)
    setPdfError(null)
    void readManuscriptPdf(experiment, pdfFile).then(
      (result) => {
        if (generation !== pdfReadGeneration.current) {
          return
        }
        setPdf(result)
        setPdfLoading(false)
      },
      (cause) => {
        if (generation !== pdfReadGeneration.current) {
          return
        }
        setPdf(null)
        setPdfError(String(cause))
        setPdfLoading(false)
      }
    )
    return () => {
      pdfReadGeneration.current += 1
    }
  }, [experiment, pdfFile, pdfRefreshKey])

  async function jumpToSource(point: PdfPagePoint): Promise<void> {
    if (!pdfFile || !onSourceJump) {
      return
    }
    const result = await window.api.researchSynctex.sourceAt({
      experimentId: experiment.id,
      pdfPath: pdfFile.relativePath,
      ...point
    })
    if (result.status !== 'ok') {
      toast.message(result.message)
      return
    }
    // A double-click also selects a word; drop it so the Revise prompt does not pop up.
    window.getSelection()?.removeAllRanges()
    setPdfSelection(null)
    onSourceJump(result.sourcePath, result.line)
  }

  async function downloadPdf(): Promise<void> {
    if (!pdf || !pdfFile || pdfLoading || compiling || downloading) {
      return
    }
    setDownloading(true)
    try {
      const result = await window.api.fs.saveDownloadedFile({
        suggestedName: basename(pdfFile.relativePath),
        content: pdf.base64,
        encoding: 'base64'
      })
      if (!result.canceled) {
        toast.success(`Saved ${basename(result.destinationPath)}`)
      }
    } catch (cause) {
      toast.error(extractIpcErrorMessage(cause, 'Could not save the PDF.'))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="min-h-0 min-w-0 flex-col" style={{ display: visible ? 'flex' : 'none' }}>
      <div className="@container flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="shrink-0 text-xs font-semibold" title="Select PDF text to Revise">
            PDF
          </h2>
          <span
            className="truncate font-mono text-2xs text-muted-foreground"
            title={`${pdfFile?.relativePath ?? 'No PDF selected'}${lastBuiltAt ? ` · built ${new Date(lastBuiltAt).toLocaleTimeString(getIntlLocale())}` : ''}`}
          >
            {pdfFile?.relativePath.split('/').at(-1) ?? 'No PDF selected'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="xs"
            variant="outline"
            disabled={!pdf || !pdfFile || pdfLoading || compiling || downloading}
            aria-label={downloading ? 'Saving…' : 'Download PDF'}
            title="Download PDF"
            onClick={() => void downloadPdf()}
          >
            <Download aria-hidden />
            <span className="hidden @md:inline">{downloading ? 'Saving…' : 'Download PDF'}</span>
          </Button>
          <Button size="xs" disabled={compiling} onClick={() => void build.compile()}>
            {compiling ? 'Compiling…' : 'Compile PDF'}
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Refresh PDF"
            disabled={pdfLoading}
            onClick={() => setPdfRefreshKey((value) => value + 1)}
          >
            <RefreshCw aria-hidden />
          </Button>
        </div>
      </div>
      {compiling ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
          <ResearchWritingCompileStatus log={build.log} startedAt={build.startedAt} />
          <Button size="xs" variant="ghost" onClick={() => setLogOpen(true)}>
            Log
          </Button>
          {build.canCancel ? (
            <Button size="xs" variant="outline" onClick={build.cancel}>
              Cancel
            </Button>
          ) : null}
        </div>
      ) : null}
      {build.error && !compiling ? (
        <div
          role="alert"
          className="flex items-start gap-2 border-b border-destructive/30 px-3 py-2 text-xs text-destructive"
        >
          <p className="min-w-0 flex-1">
            {build.error}
            {pdf ? ' Showing the previous PDF.' : ''}
          </p>
          {build.log ? (
            <Button size="xs" variant="outline" onClick={() => setLogOpen(true)}>
              View log
            </Button>
          ) : null}
        </div>
      ) : null}
      <ResearchWritingCompileLogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        log={build.log}
        compiling={compiling}
        error={build.error}
        mainSourcePath={rootFile.relativePath}
        onOpenSource={onOpenSource}
      />
      {dirtyTeXFiles > 0 ? (
        <p role="status" className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          {dirtyTeXFiles} unsaved TeX file{dirtyTeXFiles === 1 ? '' : 's'}. Save before compiling.
        </p>
      ) : null}
      <div className="relative min-h-0 flex-1">
        {pdf && pdfFile ? (
          <Suspense
            fallback={<p className="p-4 text-xs text-muted-foreground">Loading PDF viewer…</p>}
          >
            <PdfViewer
              content={pdf.base64}
              filePath={pdfFile.absolutePath}
              preferenceKey={`${experiment.workspaceId}:${pdfFile.relativePath}`}
              scrollCacheKey={`${experiment.workspaceId}:${pdfFile.relativePath}`}
              onTextSelection={setPdfSelection}
              navigation={navigation}
              onPageDoubleClick={
                onSourceJump && synctexAvailable ? (point) => void jumpToSource(point) : undefined
              }
            />
          </Suspense>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <FilePenLine className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">
              {pdfLoading ? 'Loading compiled PDF…' : 'No compiled PDF yet'}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {pdfError && !/(ENOENT|no such file)/i.test(pdfError)
                ? pdfError
                : `Compile ${basename(rootFile.relativePath)} to see it here.`}
            </p>
          </div>
        )}
        {pdfSelection && !revisionSelection && pdfFile && !projectOnly ? (
          <Button
            type="button"
            size="sm"
            className="fixed z-[90]"
            style={{
              left: Math.max(12, Math.min(pdfSelection.anchor.x, window.innerWidth - 100)),
              top: Math.max(12, Math.min(pdfSelection.anchor.y + 8, window.innerHeight - 44))
            }}
            onClick={() => {
              setRevisionSelection(pdfSelection)
              setPdfSelection(null)
            }}
          >
            Revise
          </Button>
        ) : null}
        {revisionSelection && pdfFile ? (
          <ResearchWritingPdfReviseComposer
            experiment={experiment}
            source={{
              workspaceId: experiment.workspaceId,
              workspacePath: experiment.workspacePath,
              pdfFile,
              mainTeXFile: rootFile,
              currentTeXFile: sourceCandidate
            }}
            selection={revisionSelection}
            onClose={() => setRevisionSelection(null)}
          />
        ) : null}
      </div>
    </div>
  )
}
