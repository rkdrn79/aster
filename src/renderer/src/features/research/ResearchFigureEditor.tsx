import './excalidraw-asset-path'
import '@excalidraw/excalidraw/index.css'
import './research-figure-canvas.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { hashElementsVersion } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { repairFigureScene } from '../../../../research-harness/research-figures-model.mjs'
import type { FigureSwatch } from '../../../../research-harness/research-figures-style.mjs'
import { parseFigureText } from './research-figure-document'
import { warnFigureRepairs } from './research-figure-sync-merge'
import {
  PAPER_APP_STATE,
  UI_OPTIONS,
  fitFigureInView,
  libraryItems,
  saveLibrary
} from './research-figure-editor-config'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import { applyFigureSwatch, type FigureRequestHost } from './research-figure-requests'
import {
  figureSelectionBounds,
  figureSelectionItems,
  figureSelectionText
} from './research-figure-selection-items'
import type { FiguresAgentScope } from './research-figures-agent-session'
import type { ProjectFileOwner } from './research-project-files'
import {
  ASK_CHIPS,
  ResearchFigureAskBox,
  ResearchFigurePendingAreas,
  viewportBox
} from './ResearchFigureCanvasOverlays'
import { ResearchFigureCanvasStage } from './ResearchFigureCanvasStage'
import { figureCommand } from './research-figure-commands'
import { ResearchFigureAgentStatus } from './ResearchFigureAgentStatus'
import { ResearchFigureChangeMarks } from './ResearchFigureChangeMarks'
import { ResearchFigureFilledAreas } from './ResearchFigureFilledAreas'
import { ResearchFigureMergeReview } from './ResearchFigureMergeReview'
import { ResearchFigureTurnBar } from './ResearchFigureTurnBar'
import { ResearchFigureVariantStrip } from './ResearchFigureVariantStrip'
import {
  ResearchFigureConflictBanner,
  ResearchFigureNotReady
} from './ResearchFigureConflictBanner'
import { ResearchFigureToolbar, sendArrangeShortcut } from './ResearchFigureToolbar'
import { ResearchFigureSavePartDialog } from './ResearchFigureSavePartDialog'
import { loadSavedFigureParts } from './research-figure-saved-parts'
import { useFigureAgentTurn } from './use-figure-agent-turn'
import { useFigureAsk, useFigurePendingAreas } from './use-figure-ask'
import { useFigureAttachments } from './use-figure-attachments'
import { useFigureCanvasObserver } from './use-figure-canvas-observer'
import { useFigureFileSync } from './use-figure-file-sync'

type Props = {
  owner: ProjectFileOwner
  folder: string
  slug: string
  manuscript: string | null
  scope: FiguresAgentScope
  onAgentAsked: () => void
}

export default function ResearchFigureEditor(props: Props): React.JSX.Element {
  const { owner, folder, slug, manuscript, scope, onAgentAsked } = props
  const target = useMemo(() => ({ owner, folder, slug }), [owner, folder, slug])
  const areas = useFigurePendingAreas()
  const settleApiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const settling = useFigureAttachments(settleApiRef)
  const { rebaseline, attachSettling, settle } = settling
  const pendingExternalChange = areas.onExternalChange
  const onExternalChange = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      // Why first: what the agent (or a restore) put there is where everything belongs.
      rebaseline(api)
      pendingExternalChange(api)
    },
    [rebaseline, pendingExternalChange]
  )
  const sync = useFigureFileSync(target, onExternalChange)
  const { attachApi, noteSceneChange, noteUserInput, save, apiRef } = sync
  useFigureAgentTurn(target, sync)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fittedRef = useRef(false)
  const focusCanvas = useCallback(
    () => containerRef.current?.querySelector<HTMLElement>('.excalidraw')?.focus(),
    []
  )
  const asking = useFigureAsk({
    apiRef,
    noteUserInput,
    onAgentAsked,
    focusCanvas,
    markPending: areas.markPending
  })
  const { ask, areaMode, noteFrames } = asking
  const [savePartOpen, setSavePartOpen] = useState(false)
  const { selection, viewport, frames, pageCheck, mathCandidate, inspected, toggles, observe } =
    useFigureCanvasObserver()
  const project = useMemo(() => ({ owner, folder }), [owner, folder])
  const parsed = useMemo(
    () => (sync.initialText === null ? null : parseFigureText(sync.initialText)),
    [sync.initialText]
  )
  const initialData = useMemo(() => {
    if (!parsed || parsed.issues.length || sync.initialText === null) {
      return null
    }
    // Why JSON.parse's any: Excalidraw restores whatever the file holds when it mounts; the
    // repair leaves out elements with NaN geometry, which would take the canvas down.
    const scene = repairFigureScene(JSON.parse(sync.initialText)).scene
    return {
      elements: scene.elements,
      files: scene.files ?? {},
      appState: { ...PAPER_APP_STATE, ...scene.appState },
      libraryItems: libraryItems(),
      scrollToContent: false
    }
  }, [parsed, sync.initialText])

  useEffect(() => warnFigureRepairs(parsed?.repairs ?? []), [parsed])
  useEffect(() => () => useFigureEditorHandle.setState({ handle: null }), [])
  useEffect(() => {
    apiRef.current?.refresh()
  }, [apiRef, sync.review, sync.invalid, sync.error, areaMode])

  const attach = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      settleApiRef.current = api
      attachApi(api)
      attachSettling(api)
      useFigureEditorHandle.setState({ handle: { api, target, save, noteUserInput } })
      void loadSavedFigureParts(owner, folder).then((items) =>
        api.updateLibrary({ libraryItems: items, merge: true })
      )
    },
    [attachApi, attachSettling, target, save, noteUserInput, owner, folder]
  )

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState) => {
      settle(elements, appState)
      noteSceneChange(hashElementsVersion(elements))
      if (!fittedRef.current && elements.length && apiRef.current) {
        fittedRef.current = true
        const api = apiRef.current
        window.requestAnimationFrame(() => fitFigureInView(api))
      }
      noteFrames(observe(elements, appState), appState)
    },
    [settle, noteSceneChange, apiRef, observe, noteFrames]
  )

  const host = (): FigureRequestHost => ({
    api: apiRef.current,
    target,
    folder,
    owner,
    manuscript,
    scope,
    save
  })

  function applyPalette(entry: FigureSwatch): void {
    if (apiRef.current) {
      noteUserInput()
      applyFigureSwatch(apiRef.current, entry)
    }
  }

  const askedFrame =
    ask?.kind === 'area' ? frames.find((frame) => frame.id === ask.frameId) : undefined
  const pendingAreas = frames.filter((frame) => areas.pending[frame.id] !== undefined)
  const api = apiRef.current
  const items =
    selection.count && api
      ? figureSelectionItems(api.getSceneElements(), api.getAppState().selectedElementIds)
      : []
  const anchorBox =
    askedFrame ??
    (ask?.kind === 'selection' && api
      ? figureSelectionBounds(api.getSceneElements(), api.getAppState().selectedElementIds)
      : null)

  if (!initialData) {
    return (
      <ResearchFigureNotReady
        error={sync.initialText === null ? sync.error : null}
        issues={parsed?.issues ?? []}
      />
    )
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <ResearchFigureToolbar
        dirty={sync.dirty}
        busy={sync.busy}
        savedAt={sync.savedAt}
        areaMode={areaMode}
        selectionCount={selection.count}
        selectionItems={items.length}
        fontPt={selection.fontPt}
        paperStyle={selection}
        onSave={() => void save()}
        onGenerateInArea={() => asking.startArea(selection.frameId)}
        onAskSelection={asking.askSelection}
        onArrange={(shortcut) =>
          sendArrangeShortcut(containerRef.current?.querySelector('.excalidraw') ?? null, shortcut)
        }
        onPalette={applyPalette}
        onParts={() => figureCommand('insert-parts')}
        onSavePart={() => setSavePartOpen(true)}
      />
      <ResearchFigureSavePartDialog
        open={savePartOpen}
        onOpenChange={setSavePartOpen}
        api={() => apiRef.current}
        owner={owner}
        folder={folder}
      />
      <ResearchFigureTurnBar target={target} />
      <ResearchFigureVariantStrip target={target} />
      <ResearchFigureConflictBanner
        overlaps={sync.review?.length ?? 0}
        invalid={sync.invalid}
        error={sync.initialText === null ? null : sync.error}
        areaMode={areaMode}
        onReview={() => sync.setReviewOpen(true)}
      />
      <ResearchFigureMergeReview
        open={sync.reviewOpen && Boolean(sync.review)}
        conflicts={sync.review ?? []}
        onOpenChange={sync.setReviewOpen}
        onApply={sync.resolveReview}
      />
      <ResearchFigureCanvasStage
        apiRef={apiRef}
        containerRef={containerRef}
        settling={settling}
        viewport={viewport}
        pageCheck={pageCheck}
        mathCandidate={mathCandidate}
        inspected={inspected}
        toggles={toggles}
        project={project}
        excalidraw={{
          excalidrawAPI: attach,
          initialData,
          onChange: handleChange,
          onLibraryChange: saveLibrary,
          UIOptions: UI_OPTIONS,
          aiEnabled: false,
          name: slug,
          langCode: 'en'
        }}
        onUserInput={noteUserInput}
        onSave={() => void save()}
      >
        {ask ? (
          <ResearchFigureAskBox
            title={
              ask.kind === 'area'
                ? 'Generate in this area'
                : `Ask about ${figureSelectionText(items)}`
            }
            placeholder={
              ask.kind === 'area'
                ? 'e.g. a transformer encoder block with 3 stacked layers'
                : 'e.g. make these consistent, or add arrows between these'
            }
            anchor={anchorBox ? viewportBox(anchorBox, viewport) : null}
            chips={ask.kind === 'selection' ? ASK_CHIPS : undefined}
            error={asking.error}
            sending={asking.sending}
            onSend={(prompt) => void asking.send(host(), prompt)}
            onCancel={asking.cancel}
          />
        ) : null}
        <ResearchFigurePendingAreas
          areas={pendingAreas}
          viewport={viewport}
          onDismiss={areas.dismiss}
        />
        <ResearchFigureFilledAreas
          api={api}
          viewport={viewport}
          pending={areas.pending}
          containerRef={containerRef}
          onRegenerate={(id, prompt) => void asking.regenerate(host(), id, prompt)}
          onRemove={asking.removeArea}
        />
        <ResearchFigureChangeMarks target={target} api={api} viewport={viewport} />
        <ResearchFigureAgentStatus target={target} />
      </ResearchFigureCanvasStage>
    </div>
  )
}
