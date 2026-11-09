import './research-figures-shell.css'
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Maximize2, Minimize2, PanelRight, Shapes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { RecoverableRenderErrorBoundary } from '@/components/error-boundaries/RecoverableRenderErrorBoundary'
import { ResearchEmptyState, ResearchPageBody, ResearchPageHeader } from './ResearchPageLayout'
import { ResearchFigureAgentPane } from './ResearchFigureAgentPane'
import { ResearchFigureAgentPill } from './ResearchFigureAgentPill'
import './research-figure-history-tab'
import './research-figure-parts-tab'
import { ResearchFigureHelpSection } from './ResearchFigureHelpSection'
import {
  ResearchFigureNewDialog,
  type NewFigureDraft,
  type NewFigureRequest
} from './ResearchFigureNewDialog'
import { ResearchFigureRecreateDialog } from './ResearchFigureRecreateDialog'
import type { FigureReference } from './research-figure-recreate'
import { ResearchFigurePreview } from './ResearchFigurePreview'
import { ResearchFiguresFirstRun } from './ResearchFiguresFirstRun'
import { ResearchFiguresLayout, useFiguresLayoutMode } from './ResearchFiguresLayout'
import { ResearchFiguresList } from './ResearchFiguresList'
import { ResearchFiguresStrip } from './ResearchFiguresStrip'
import {
  buildFigureMessageContext,
  type FigureQuickRequest
} from './research-figures-agent-prompts'
import {
  consumeFiguresAgentFocus,
  subscribeFiguresAgentFocus,
  type FigureMessageContext
} from './research-figures-agent-session'
import { figurePromptContext } from './research-figure-prompt-context'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import {
  newFigurePromptContext,
  sendFigureChatText,
  sendFigureStart
} from './research-figure-chat-send'
import {
  AGENT_TAB_ID,
  ResearchFigureSidePanel,
  openFigureSidePanelTab,
  useActiveFigureSidePanelTab
} from './research-figure-side-panel'
import {
  sendFigureToolbarCommand,
  useFigureShortcuts,
  type FigureShortcut
} from './research-figure-shortcuts'
import {
  openFiguresSidePanel,
  toggleFiguresFocus,
  toggleFiguresSidePanel,
  useFiguresLayout
} from './research-figures-layout-mode'
import {
  canvasSelectionCount,
  manuscriptSource,
  newFigureSendTrack,
  openFigureSendTrack,
  selectedCanvasImage
} from './research-figures-page-helpers'
import { useFigureCanvasState } from './use-figure-canvas-state'
import {
  createFigure,
  openFiguresProject,
  selectFigure,
  useFigureListAutoRefresh,
  useResearchFigures
} from './research-figures-store'
import { projectOwnerKey, type ProjectFileOwner } from './research-project-files'
import { useResearchRecords } from './research-records-store'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { writingOwnerExperiment, type WritingProjectScope } from './research-writing-project'

const ResearchFigureEditor = lazy(() => import('./ResearchFigureEditor'))

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function FiguresWorkspace({ scope }: { scope: WritingProjectScope }): React.JSX.Element {
  const owner = useMemo<ProjectFileOwner>(
    () => ({
      hostId: scope.hostId,
      workspaceId: scope.workspaceId,
      workspacePath: scope.workspacePath
    }),
    [scope.hostId, scope.workspaceId, scope.workspacePath]
  )
  const agentScope = useMemo(
    () => ({ hostId: scope.hostId, workspaceId: scope.workspaceId }),
    [scope.hostId, scope.workspaceId]
  )
  const linked = useResearchRecords(
    (state) =>
      (state.document ? writingOwnerExperiment(state.document.experiments, scope) : null)
        ?.manuscript
  )
  const figures = useResearchFigures(
    useShallow((state) => ({
      folder: state.folder,
      manuscript: state.manuscript,
      listing: state.listing,
      signatures: state.signatures,
      manuscriptSignature: state.manuscriptSignature,
      selected: state.selected,
      loading: state.loading,
      error: state.error
    }))
  )
  const { folder, manuscript, listing, signatures, selected, loading, error } = figures
  const mode = useFiguresLayoutMode()
  const focus = useFiguresLayout((state) => state.focus)
  const sideTab = useActiveFigureSidePanelTab()
  const openSlug = selected?.kind === 'figure' ? selected.slug : null
  const canvas = useFigureCanvasState(openSlug)
  const [newDraft, setNewDraft] = useState<NewFigureDraft | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [recreate, setRecreate] = useState<{ selected: FigureReference | null } | null>(null)
  const taken = useMemo(() => new Set(listing.figures.map((figure) => figure.slug)), [listing])
  useEffect(() => {
    let live = true
    void manuscriptSource(scope, linked).then(
      (source) => live && void openFiguresProject(owner, source)
    )
    return () => {
      live = false
    }
  }, [owner, scope, linked])
  useFigureListAutoRefresh(owner)
  useEffect(() => {
    if (consumeFiguresAgentFocus(agentScope)) {
      openFiguresSidePanel()
    }
    return subscribeFiguresAgentFocus(() => {
      if (consumeFiguresAgentFocus(agentScope)) {
        openFiguresSidePanel()
        openFigureSidePanelTab(AGENT_TAB_ID)
      }
    })
  }, [agentScope])
  const runShortcut = useCallback((shortcut: FigureShortcut) => {
    if (shortcut === 'side') {
      toggleFiguresSidePanel()
    } else if (shortcut === 'focus') {
      toggleFiguresFocus()
    } else {
      sendFigureToolbarCommand(shortcut)
    }
  }, [])
  useFigureShortcuts({ run: runShortcut, canvasSelection: canvasSelectionCount })

  function requestHost() {
    const handle = useFigureEditorHandle.getState().handle
    const open = handle && openSlug !== null && handle.target.slug === openSlug
    return {
      api: open ? handle.api : null,
      target: open ? handle.target : null,
      folder: folder ?? '',
      owner,
      manuscript,
      scope: agentScope,
      save: open ? handle.save : async () => true
    }
  }

  const messageContext = useCallback((): FigureMessageContext | null => {
    if (!folder) {
      return null
    }
    const handle = useFigureEditorHandle.getState().handle
    const open = handle && openSlug !== null && handle.target.slug === openSlug
    return buildFigureMessageContext(
      figurePromptContext({
        api: open ? handle.api : null,
        target: open ? handle.target : null,
        folder,
        owner,
        manuscript
      })
    )
  }, [folder, owner, manuscript, openSlug])

  async function quickRequest(request: FigureQuickRequest): Promise<string | null> {
    if (!folder) {
      return 'The figures folder is not known yet.'
    }
    const { sendFigureQuickRequest } = await import('./research-figure-requests')
    return sendFigureQuickRequest(requestHost(), request)
  }

  async function sendRecreate(
    reference: FigureReference,
    matchPage: boolean,
    maxHeightIn: number | null
  ) {
    const { sendFigureRecreateRequest } = await import('./research-figure-recreate')
    const failure = await sendFigureRecreateRequest(
      requestHost(),
      reference,
      matchPage,
      maxHeightIn
    )
    if (!failure) {
      openFiguresSidePanel()
    }
    return failure
  }

  async function createFromDialog(request: NewFigureRequest): Promise<string | null> {
    if (!folder) {
      return 'The figures folder is not known yet.'
    }
    try {
      if (request.start !== 'plot') {
        await createFigure(owner, request.slug, request.size, request.name)
      }
    } catch (cause) {
      return errorText(cause)
    }
    if (request.start === 'image') {
      setRecreate({ selected: null })
      return null
    }
    const context = newFigurePromptContext({
      owner,
      folder,
      manuscript,
      slug: request.slug,
      size: request.size
    })
    const failure = await sendFigureStart(
      agentScope,
      context,
      { kind: request.start, description: request.description, template: request.template },
      request.start === 'plot' || request.start === 'blank'
        ? null
        : await newFigureSendTrack(owner, folder, request.slug)
    )
    if (request.start !== 'blank') {
      openFigureSidePanelTab(AGENT_TAB_ID)
      openFiguresSidePanel()
    }
    return failure
  }

  function openNew(draft: NewFigureDraft | null): void {
    setNewDraft(draft)
    setNewOpen(true)
  }

  const center =
    selected?.kind === 'figure' && folder ? (
      <RecoverableRenderErrorBoundary
        boundaryId="research-figures.editor"
        surface="page"
        title="The figure editor hit an error."
        description="Pick the figure again, or reopen the page."
      >
        <Suspense
          fallback={
            <p role="status" className="p-6 text-sm text-muted-foreground">
              Loading editor…
            </p>
          }
        >
          <ResearchFigureEditor
            key={`${projectOwnerKey(owner)}:${folder}:${selected.slug}`}
            owner={owner}
            folder={folder}
            slug={selected.slug}
            manuscript={manuscript}
            scope={agentScope}
            onAgentAsked={() => {
              openFigureSidePanelTab(AGENT_TAB_ID)
              openFiguresSidePanel()
            }}
          />
        </Suspense>
      </RecoverableRenderErrorBoundary>
    ) : selected?.kind === 'file' && folder ? (
      <ResearchFigurePreview
        owner={owner}
        folder={folder}
        name={selected.name}
        signature={signatures[selected.name] ?? ''}
      />
    ) : (
      <ResearchPageBody>
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading figures…
          </p>
        ) : (
          <ResearchFiguresFirstRun onNew={openNew} />
        )}
      </ResearchPageBody>
    )

  const sideVisible = mode.side !== 'hidden'
  return (
    <section
      aria-label="Figures"
      data-figures-shell=""
      className="flex min-h-0 flex-1 flex-col bg-background text-foreground"
    >
      <ResearchPageHeader
        title="Figures"
        context={folder ?? undefined}
        actions={
          <>
            <Button
              size="xs"
              variant={focus ? 'secondary' : 'ghost'}
              aria-pressed={focus}
              aria-label="Focus mode"
              title="Focus mode (⌘.)"
              onClick={toggleFiguresFocus}
            >
              {focus ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />} Focus
            </Button>
            <Button
              size="xs"
              variant={sideVisible ? 'secondary' : 'ghost'}
              aria-pressed={sideVisible}
              aria-label="Agent panel"
              title="Agent, parts and history (⌘\)"
              onClick={toggleFiguresSidePanel}
            >
              <PanelRight aria-hidden /> Agent
            </Button>
          </>
        }
      />
      {error ? (
        <p role="alert" className="border-b border-border px-6 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <ResearchFiguresLayout
        list={
          <ResearchFiguresList
            owner={owner}
            folder={folder}
            manuscript={manuscript}
            manuscriptSignature={figures.manuscriptSignature}
            listing={listing}
            signatures={signatures}
            selected={selected}
            onSelect={(selection) => selectFigure(owner, selection)}
            onNew={() => openNew(null)}
          />
        }
        strip={
          <ResearchFiguresStrip
            owner={owner}
            folder={folder}
            listing={listing}
            signatures={signatures}
            selected={selected}
            onSelect={(selection) => selectFigure(owner, selection)}
            onNew={() => openNew(null)}
          />
        }
        center={center}
        pill={
          <ResearchFigureAgentPill
            onSend={
              folder
                ? async (text) => {
                    const host = requestHost()
                    const track = await openFigureSendTrack(host)
                    return sendFigureChatText(agentScope, figurePromptContext(host), text, track)
                  }
                : null
            }
            onExpand={() => {
              openFigureSidePanelTab(AGENT_TAB_ID)
              openFiguresSidePanel()
            }}
          />
        }
        side={
          <ResearchFigureSidePanel
            context={{ owner, folder, slug: openSlug, manuscript, scope: agentScope }}
            agent={
              <ResearchFigureAgentPane
                scope={agentScope}
                visible={sideVisible && sideTab === AGENT_TAB_ID}
                onRequest={folder ? quickRequest : null}
                onRecreate={() => setRecreate({ selected: selectedCanvasImage() })}
                onTemplate={() => openNew({ start: 'template' })}
                messageContext={messageContext}
                canvas={canvas}
                figureKey={openSlug}
              />
            }
          />
        }
      />
      <ResearchFigureHelpSection />
      <ResearchFigureRecreateDialog
        open={recreate !== null}
        selectedImage={recreate?.selected ?? null}
        hasDrawing={canvas === 'drawn' || canvas === 'sketch'}
        onOpenChange={(open) => setRecreate(open ? { selected: null } : null)}
        onSend={sendRecreate}
      />
      <ResearchFigureNewDialog
        open={newOpen}
        folder={folder}
        existing={taken}
        draft={newDraft}
        onOpenChange={setNewOpen}
        onOpenExisting={(slug) => selectFigure(owner, { kind: 'figure', slug })}
        onCreate={createFromDialog}
      />
    </section>
  )
}

/** Figures is the project's: diagrams and plots beside the manuscript, with their agent. */
export function ResearchFiguresPage(): React.JSX.Element {
  const context = useAppStore(useShallow(selectResearchWorkspaceContext))
  const { hostId, workspaceId, workspacePath, projectId } = context
  const name = context.projectName ?? context.workspaceName ?? 'Project'
  const scope = useMemo<WritingProjectScope | null>(
    () =>
      hostId && workspaceId && workspacePath
        ? { hostId, workspaceId, workspacePath, projectId, name }
        : null,
    [hostId, workspaceId, workspacePath, projectId, name]
  )
  if (!scope) {
    return (
      <section aria-label="Figures" className="flex min-h-0 flex-1 flex-col bg-background">
        <ResearchPageHeader title="Figures" />
        <ResearchPageBody>
          <ResearchEmptyState icon={Shapes} title="No project open">
            Open a project to draw its figures.
          </ResearchEmptyState>
        </ResearchPageBody>
      </section>
    )
  }
  return <FiguresWorkspace key={`${scope.hostId}:${scope.workspaceId}`} scope={scope} />
}
