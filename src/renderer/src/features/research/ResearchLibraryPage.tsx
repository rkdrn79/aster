import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { BookOpen, Download, FileUp, Plus } from 'lucide-react'
import type { PdfNavigationRequest } from '@/components/editor/PdfViewer'
import { Button } from '@/components/ui/button'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { extractIpcErrorMessage } from '@/lib/ipc-error'
import { useAppStore } from '@/store'
import {
  isPaperInScope,
  libraryScopeKey,
  type LibraryPaper,
  type LibraryScope,
  type PaperHighlight
} from '../../../../shared/research/research-library'
import { ResearchLibraryArxivDialog } from './research-library-arxiv-dialog'
import { ResearchLibraryPaperForm, type PaperDraft } from './research-library-paper-form'
import { ResearchLibraryPaperList, newestFirst } from './research-library-paper-list'
import { ResearchLibraryPaperPanel, type PaperPanelTab } from './research-library-paper-panel'
import {
  addLibraryPaper,
  addPaperHighlight,
  importPdfPaper,
  updateLibraryPaper
} from './research-library-paper-records'
import { ResearchLibraryReader, libraryPaperPdfFile } from './research-library-reader'
import { ResearchLibrarySplitLayout } from './ResearchLibrarySplitLayout'
import {
  buildReadingPrompt,
  sendReadingPrompt,
  type ReadingRequest
} from './research-library-reading-agent'
import { useReadingLanguage } from './research-library-reading-language'
import type { ReaderSelectionAction } from './research-library-selection-toolbar'
import { useResearchLibrary } from './research-library-store'
import {
  consumeLibraryAgentFocus,
  subscribeLibraryAgentFocus
} from './research-library-agent-focus'
import { ResearchEmptyState, ResearchPageBody, ResearchPageHeader } from './ResearchPageLayout'
import { selectResearchWorkspaceContext } from './research-workspace-context'

const NO_HIGHLIGHTS: readonly PaperHighlight[] = []

function ResearchLibraryWorkspace({ scope }: { scope: LibraryScope }): React.JSX.Element {
  const document = useResearchLibrary((state) => state.document)
  const saving = useResearchLibrary((state) => state.saving)
  const loading = useResearchLibrary((state) => state.loading)
  const storeError = useResearchLibrary((state) => state.error)
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null)
  const [mode, setMode] = useState<'read' | 'edit' | 'new'>('read')
  const [panelTab, setPanelTab] = useState<PaperPanelTab>('overview')
  const scopeKey = libraryScopeKey(scope)
  useEffect(() => {
    const focus = (): void => {
      if (consumeLibraryAgentFocus(scopeKey)) {
        setPanelTab('agent')
      }
    }
    const unsubscribe = subscribeLibraryAgentFocus(focus)
    focus()
    return unsubscribe
  }, [scopeKey])
  const [navigation, setNavigation] = useState<PdfNavigationRequest | null>(null)
  const [listOpen, setListOpen] = useState(() => window.innerWidth >= 1440)
  const [arxivOpen, setArxivOpen] = useState(false)
  const [language, setLanguage] = useReadingLanguage()
  const [actionError, setActionError] = useState<string | null>(null)
  const canImportFiles = scope.hostId === 'local' && Boolean(window.api.researchLibrary?.importPdf)

  const papers = useMemo(
    () =>
      (document?.papers ?? []).filter((paper) => isPaperInScope(paper, scope)).sort(newestFirst),
    [document, scope]
  )
  const highlightsByPaper = useMemo(() => {
    const grouped = new Map<string, PaperHighlight[]>()
    for (const highlight of document?.highlights ?? []) {
      grouped.set(highlight.paperId, [...(grouped.get(highlight.paperId) ?? []), highlight])
    }
    return grouped
  }, [document])
  const highlightCounts = useMemo(
    () => new Map([...highlightsByPaper].map(([id, entries]) => [id, entries.length])),
    [highlightsByPaper]
  )
  const selectedPaper = papers.find((paper) => paper.id === selectedPaperId) ?? papers[0] ?? null
  const selectedHighlights = selectedPaper
    ? (highlightsByPaper.get(selectedPaper.id) ?? NO_HIGHLIGHTS)
    : NO_HIGHLIGHTS
  const unread = papers.filter((paper) => paper.status === 'unread').length

  function openPaper(paperId: string): void {
    setSelectedPaperId(paperId)
    setMode('read')
    setActionError(null)
  }

  async function sendRequest(paper: LibraryPaper, request: ReadingRequest): Promise<string | null> {
    const file = libraryPaperPdfFile(paper)
    const prompt = buildReadingPrompt(
      { paper, pdfAbsolutePath: file?.absolutePath ?? null, language },
      request
    )
    const result = await sendReadingPrompt(scope, prompt)
    if (!result.ok) {
      return result.message
    }
    setPanelTab('agent')
    return null
  }

  async function handleSelection(action: ReaderSelectionAction): Promise<string | null> {
    if (!selectedPaper) {
      return 'Choose a paper first.'
    }
    if (action.kind === 'highlight') {
      try {
        await addPaperHighlight(selectedPaper.id, action.selection, action.color)
        return null
      } catch (cause) {
        return `Highlight was not saved. ${String(cause)}`
      }
    }
    return sendRequest(
      selectedPaper,
      action.kind === 'ask'
        ? { kind: 'ask', question: action.question, selection: action.selection }
        : { kind: action.kind, selection: action.selection }
    )
  }

  async function importPdf(): Promise<void> {
    setActionError(null)
    try {
      const paper = await importPdfPaper(scope)
      if (paper) {
        openPaper(paper.id)
      }
    } catch (cause) {
      setActionError(extractIpcErrorMessage(cause, 'The PDF was not imported.'))
    }
  }

  async function attachPdf(paper: LibraryPaper): Promise<void> {
    setActionError(null)
    try {
      const result = await window.api.researchLibrary.importPdf({
        workspacePath: scope.workspacePath
      })
      if (result.status === 'imported') {
        await updateLibraryPaper(paper.id, (current) => ({
          ...current,
          pdfPath: result.relativePath
        }))
      }
    } catch (cause) {
      setActionError(extractIpcErrorMessage(cause, 'The PDF was not attached.'))
    }
  }

  async function savePaper(draft: PaperDraft): Promise<void> {
    if (mode === 'edit' && selectedPaper) {
      await updateLibraryPaper(selectedPaper.id, (current) => ({ ...current, ...draft }))
      setMode('read')
      return
    }
    const now = new Date().toISOString()
    const paper: LibraryPaper = {
      ...draft,
      id: createBrowserUuid(),
      scope,
      status: 'unread',
      createdAt: now,
      updatedAt: now
    }
    await addLibraryPaper(paper)
    openPaper(paper.id)
  }

  const errorMessage = actionError ?? storeError

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
      aria-label="Research library"
    >
      <ResearchPageHeader
        title="Library"
        context={
          document && papers.length
            ? `${papers.length} ${papers.length === 1 ? 'paper' : 'papers'}${unread ? ` · ${unread} unread` : ''}`
            : undefined
        }
        actions={
          document ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setMode('new')}>
                <Plus aria-hidden /> Manual
              </Button>
              {canImportFiles ? (
                <Button size="sm" variant="outline" onClick={() => void importPdf()}>
                  <FileUp aria-hidden /> Import PDF
                </Button>
              ) : null}
              <Button size="sm" onClick={() => setArxivOpen(true)}>
                <Download aria-hidden /> Add from arXiv
              </Button>
            </>
          ) : null
        }
      />
      {errorMessage ? (
        <p role="alert" className="border-b border-border px-6 py-2 text-xs text-destructive">
          {errorMessage}
        </p>
      ) : null}
      {!document ? (
        <ResearchPageBody>
          <ResearchEmptyState icon={BookOpen} title="Library">
            {loading ? 'Loading…' : 'The library is unavailable.'}
          </ResearchEmptyState>
        </ResearchPageBody>
      ) : mode !== 'read' ? (
        <div className="flex min-h-0 flex-1">
          <ResearchLibraryPaperForm
            key={mode === 'edit' ? selectedPaper?.id : 'new'}
            scope={scope}
            paper={mode === 'edit' ? selectedPaper : null}
            saving={saving}
            onSave={savePaper}
            onCancel={() => setMode('read')}
          />
        </div>
      ) : selectedPaper ? (
        <ResearchLibrarySplitLayout
          listOpen={listOpen}
          list={
            <ResearchLibraryPaperList
              papers={papers}
              highlightCounts={highlightCounts}
              selectedPaperId={selectedPaper.id}
              onSelect={openPaper}
            />
          }
          reader={
            <ResearchLibraryReader
              paper={selectedPaper}
              highlights={selectedHighlights}
              navigation={navigation}
              paperListOpen={listOpen}
              onTogglePaperList={() => setListOpen((value) => !value)}
              onSelectionAction={handleSelection}
              onAttachPdf={canImportFiles ? () => attachPdf(selectedPaper) : null}
            />
          }
          panel={
            <ResearchLibraryPaperPanel
              scope={scope}
              paper={selectedPaper}
              highlights={selectedHighlights}
              tab={panelTab}
              language={language}
              onTabChange={setPanelTab}
              onLanguageChange={setLanguage}
              onNavigate={(highlight) =>
                setNavigation({
                  pageNumber: highlight.pageNumber,
                  top: highlight.rects[0]?.y,
                  requestId: Date.now()
                })
              }
              onRequest={(request) => sendRequest(selectedPaper, request)}
              onEdit={() => setMode('edit')}
              onRemoved={() => setSelectedPaperId(null)}
            />
          }
        />
      ) : (
        <ResearchPageBody>
          <ResearchEmptyState
            icon={BookOpen}
            title="No papers yet"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => setArxivOpen(true)}>
                  <Download aria-hidden /> Add from arXiv
                </Button>
                {canImportFiles ? (
                  <Button size="sm" variant="outline" onClick={() => void importPdf()}>
                    <FileUp aria-hidden /> Import PDF
                  </Button>
                ) : null}
              </div>
            }
          >
            Add the papers this project builds on.
          </ResearchEmptyState>
        </ResearchPageBody>
      )}
      <ResearchLibraryArxivDialog
        scope={scope}
        open={arxivOpen}
        onOpenChange={setArxivOpen}
        onOpenPaper={openPaper}
      />
    </section>
  )
}

export function ResearchLibraryPage(): React.JSX.Element {
  const context = useAppStore(useShallow(selectResearchWorkspaceContext))
  const storeError = useResearchLibrary((state) => state.error)
  useEffect(() => {
    void useResearchLibrary.getState().load()
  }, [])
  const { hostId, workspaceId, workspacePath } = context
  const scope = useMemo(
    () => (hostId && workspaceId && workspacePath ? { hostId, workspaceId, workspacePath } : null),
    [hostId, workspaceId, workspacePath]
  )
  if (!scope) {
    return (
      <section
        className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
        aria-label="Research library"
      >
        <ResearchPageHeader title="Library" />
        <ResearchPageBody>
          <ResearchEmptyState icon={BookOpen} title="No project open">
            {storeError ?? 'Open a project to see its papers.'}
          </ResearchEmptyState>
        </ResearchPageBody>
      </section>
    )
  }
  return <ResearchLibraryWorkspace key={libraryScopeKey(scope)} scope={scope} />
}
