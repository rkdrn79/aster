import { useCallback, useEffect, type ReactNode } from 'react'
import { CaptureUpdateAction, Excalidraw, FONT_FAMILY } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI, ExcalidrawProps } from '@excalidraw/excalidraw/types'
import { PanelRight, Shapes, Sigma, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fitFigureInView, fitShortcut } from './research-figure-editor-config'
import { registerPaperFonts } from './research-figure-paper-fonts'
import type { ProjectFileOwner } from './research-project-files'
import { viewportBox, type CanvasViewport } from './ResearchFigureCanvasOverlays'
import { ResearchFigureInsertPanel } from './ResearchFigureInsertPanel'
import { ResearchFigureInspector } from './ResearchFigureInspector'
import { ResearchFigurePainterPill } from './ResearchFigureInspectorPaint'
import { ResearchFigureLabelBar, runLabelMath } from './ResearchFigureLabelBar'
import { ResearchFigureLockMark, useFigureLockHover } from './ResearchFigureLockMarks'
import { ResearchFigureSegmentHandles } from './ResearchFigureSegmentHandles'
import { ResearchFigureSpacingOverlay } from './ResearchFigureSpacingOverlay'
import { ResearchFigureMainMenu } from './ResearchFigureMainMenu'
import { ResearchFigureMathPopover } from './ResearchFigureMathPopover'
import { ResearchFigurePageWarning } from './ResearchFigurePageWarning'
import {
  ResearchFigureVisionPreview,
  setFigureVision,
  useFigureVision
} from './ResearchFigureVisionPreview'
import { sendArrangeShortcut } from './ResearchFigureToolbar'
import { isTypingTarget, type useFigureAttachments } from './use-figure-attachments'
import { useFigureAutoFit, useViewAdjustmentTracking } from './use-figure-auto-fit'
import type { Inspected, MathCandidate, PageCheck } from './use-figure-canvas-observer'
import { useFigureImageDrop } from './use-figure-image-drop'
import { useFigureDuplicate } from './use-figure-duplicate'
import { useFigureEditKeys } from './use-figure-edit-keys'
import { useFigureInsert } from './use-figure-insert'
import { useFigureInspector } from './use-figure-inspector'
import { useFigureMathEditing } from './use-figure-math-editing'
import { useFigurePainterPointer } from './use-figure-painter'
import { useFigurePanelMarquee } from './use-figure-panel-marquee'
import { FIGURE_MOD_KEY, registerFigureCanvasShortcut } from './research-figure-shortcuts'

// Why before any canvas draws: Excalidraw names a text's font from this table on every paint.
registerPaperFonts(FONT_FAMILY)

const INSPECTOR_CHORD = FIGURE_MOD_KEY === 'Cmd' ? '⌘I' : 'Ctrl+I'
/** A tool on the floating island beside Excalidraw's palette (research-figure-canvas.css). */
const CANVAS_TOOL =
  'research-canvas-tool flex size-7 items-center justify-center rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 [&_svg]:size-4'

// Why at import: the `?` help lists the keys the stage adds, beside the page's own chords.
for (const entry of [
  { label: 'New math label (Enter edits the selected one)', keys: ['M'] },
  { label: 'Insert a part (/ searches)', keys: ['I'] },
  { label: 'Show or hide the Inspector', keys: [FIGURE_MOD_KEY, 'I'] },
  { label: 'Nudge 1 pt (Shift: 8 pt)', keys: ['←', '↑', '↓', '→'] },
  // Why: Excalidraw's ⌘Delete reset is off (it would delete the page); its row is hidden.
  { label: 'Clear the drawing, keeping the page: figure menu', keys: ['☰'] }
]) {
  registerFigureCanvasShortcut(entry)
}

type Props = {
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  settling: ReturnType<typeof useFigureAttachments>
  viewport: CanvasViewport
  pageCheck: PageCheck
  mathCandidate: MathCandidate
  inspected: Inspected
  toggles: { grid: boolean; snap: boolean }
  project: { owner: ProjectFileOwner; folder: string }
  /** Excalidraw's props; the stage adds the theme and its menu. */
  excalidraw: Omit<ExcalidrawProps, 'theme' | 'children'>
  onUserInput: () => void
  onSave: () => void
  /** The agent's overlays over the canvas. */
  children: ReactNode
}

/** True for Excalidraw's ⌘Delete, which would wipe the page frame with the drawing. */
function isClearCanvas(event: React.KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && (event.key === 'Backspace' || event.key === 'Delete')
}

function stop(event: React.SyntheticEvent): void {
  event.preventDefault()
  event.stopPropagation()
}

/**
 * The canvas with Aster's direct manipulation around it: settling, point nudges, math editing,
 * picture drops, the print-area warning, the Inspector beside it and canvas shortcuts.
 * Excalidraw itself comes in as children.
 */
export function ResearchFigureCanvasStage(props: Props): React.JSX.Element {
  const { apiRef, containerRef, settling, viewport, pageCheck, mathCandidate, onUserInput } = props
  const focusCanvas = useCallback(
    () => containerRef.current?.querySelector<HTMLElement>('.excalidraw-container')?.focus(),
    [containerRef]
  )
  const math = useFigureMathEditing(apiRef, settling.settleEdit, focusCanvas)
  const inspector = useFigureInspector(
    apiRef,
    containerRef,
    settling.settleEdit,
    props.inspected,
    props.project
  )
  const drop = useFigureImageDrop(apiRef, inspector.context.commit)
  const insert = useFigureInsert(apiRef, settling.settleEdit, inspector.context.style)
  const duplicate = useFigureDuplicate(apiRef)
  const editKey = useFigureEditKeys(
    apiRef,
    settling.settleEdit,
    inspector.context.style,
    duplicate.prepare
  )
  const paintOnClick = useFigurePainterPointer(apiRef, settling.settleEdit)
  const marquee = useFigurePanelMarquee(apiRef, focusCanvas)
  const lockHover = useFigureLockHover(apiRef)
  useFigureAutoFit(apiRef, containerRef)
  const tracking = useViewAdjustmentTracking(apiRef)
  const vision = useFigureVision((state) => state.vision)
  // Why: a grayscale or deuteranopia check belongs to this canvas, not to the next one opened.
  useEffect(() => () => setFigureVision(null), [])

  const onKey = (event: React.KeyboardEvent): void => {
    onUserInput()
    tracking.onKeyDown(event)
    if (settling.nudge(event) || math.onKey(event) || insert.onKey(event) || editKey(event)) {
      return
    }
    const typing = isTypingTarget(event.target)
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'i') {
      stop(event)
      inspector.toggle()
      return
    }
    if (isClearCanvas(event) && !typing) {
      // Why: Excalidraw's clear also deletes the page frame; the figure menu clears the drawing.
      stop(event)
      return
    }
    const fit = fitShortcut(event)
    if (fit && apiRef.current) {
      stop(event)
      fitFigureInView(apiRef.current, fit)
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      stop(event)
      props.onSave()
    }
  }

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1"
      // Why the whole stage: an edit made in the Inspector beside the canvas autosaves too.
      onPointerDownCapture={onUserInput}
      onKeyDownCapture={onUserInput}
    >
      <div
        ref={containerRef}
        data-research-figure-canvas=""
        data-inspector-open={inspector.visible ? '' : undefined}
        data-figure-vision={vision ?? undefined}
        className="relative min-h-0 min-w-0 flex-1"
        onPointerDownCapture={(event) => {
          onUserInput()
          tracking.onPointerDown(event)
          inspector.noteInteraction()
          marquee.onPointerDownCapture(event)
        }}
        onWheelCapture={tracking.onWheel}
        onPointerUpCapture={() => {
          inspector.noteInteraction()
          paintOnClick()
        }}
        onPointerMove={lockHover.onPointerMove}
        onPointerLeave={lockHover.onPointerLeave}
        onKeyUpCapture={inspector.noteInteraction}
        // Why: Excalidraw caches where its canvas sits; panes and banners move it without a resize.
        onPointerEnter={() => apiRef.current?.refresh()}
        onDoubleClickCapture={(event) => {
          onUserInput()
          math.onDoubleClick(event)
        }}
        onDragOverCapture={(event) => {
          if (!insert.onDragOver(event)) {
            drop.onDragOver(event)
          }
        }}
        onDropCapture={(event) => {
          onUserInput()
          if (!insert.onDrop(event)) {
            drop.onDrop(event)
          }
        }}
        onKeyDownCapture={onKey}
      >
        <Excalidraw
          {...props.excalidraw}
          onDuplicate={duplicate.onDuplicate}
          // Why light: a paper figure prints on white; dark mode would invert its colours.
          theme="light"
        >
          <ResearchFigureMainMenu
            api={() => apiRef.current}
            grid={props.toggles.grid}
            snap={props.toggles.snap}
          />
        </Excalidraw>
        {props.children}
        <ResearchFigureSpacingOverlay api={apiRef.current} settleEdit={settling.settleEdit} />
        <ResearchFigureSegmentHandles api={apiRef.current} settleEdit={settling.settleEdit} />
        {marquee.box ? (
          <div
            className="research-figure-marquee pointer-events-none absolute z-[4]"
            style={{
              left: marquee.box.x,
              top: marquee.box.y,
              width: marquee.box.width,
              height: marquee.box.height
            }}
          />
        ) : null}
        <ResearchFigureLockMark hover={lockHover} viewport={viewport} api={() => apiRef.current} />
        <ResearchFigureLabelBar
          api={apiRef.current}
          settleEdit={settling.settleEdit}
          hidden={Boolean(math.open)}
          onMath={(targets) => runLabelMath(apiRef.current, targets, math)}
        />
        <ResearchFigurePainterPill />
        <ResearchFigureVisionPreview />
        <div
          role="toolbar"
          aria-label="Figure insert tools"
          aria-orientation="vertical"
          // Why light in either theme: it floats on the paper beside Excalidraw's own palette.
          className="research-canvas-island absolute top-[60px] left-4 z-[4] flex flex-col gap-0.5 rounded-xl p-1"
        >
          <button
            type="button"
            className={CANVAS_TOOL}
            aria-label="New math label (M)"
            title="New math label (M)"
            onClick={() => void math.newMath()}
          >
            <Sigma aria-hidden />
          </button>
          <button
            type="button"
            className={CANVAS_TOOL}
            aria-label="Insert a part (I)"
            aria-expanded={insert.open}
            title="Insert a part (I)"
            onClick={() => insert.setOpen(!insert.open)}
          >
            <Shapes aria-hidden />
          </button>
          <button
            type="button"
            className={CANVAS_TOOL}
            aria-label={`Inspector (${INSPECTOR_CHORD})`}
            aria-pressed={inspector.visible}
            title={`Inspector: role, badge, place and size (${INSPECTOR_CHORD})`}
            onClick={inspector.toggle}
          >
            <PanelRight aria-hidden />
          </button>
        </div>
        {insert.open ? (
          <div
            role="dialog"
            aria-label="Insert"
            className="research-panel-in-left surface-floating absolute top-[60px] left-[60px] z-20 flex h-[min(440px,calc(100%-80px))] w-[316px] flex-col overflow-hidden rounded-2xl"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                insert.setOpen(false)
                focusCanvas()
              }
            }}
          >
            <div className="flex h-10 shrink-0 items-center pr-2 pl-3 text-[13px] font-medium">
              <span className="flex-1">Insert</span>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Close Insert"
                onClick={() => {
                  insert.setOpen(false)
                  focusCanvas()
                }}
              >
                <X aria-hidden />
              </Button>
            </div>
            <ResearchFigureInsertPanel
              api={() => apiRef.current}
              style={inspector.context.style}
              project={props.project}
              settle={settling.settleEdit}
              autoFocus
              onInserted={focusCanvas}
            />
          </div>
        ) : null}
        <ResearchFigurePageWarning
          page={pageCheck.page}
          count={pageCheck.outside.length}
          viewport={viewport}
          onSelect={() =>
            apiRef.current?.updateScene({
              appState: {
                selectedElementIds: Object.fromEntries(pageCheck.outside.map((id) => [id, true])),
                selectedGroupIds: {}
              },
              captureUpdate: CaptureUpdateAction.NEVER
            })
          }
        />
        {mathCandidate && !math.open ? (
          <button
            type="button"
            className="research-canvas-island research-canvas-tool research-pop-in absolute z-10 inline-flex h-7 items-center gap-2 rounded-lg px-3 text-xs font-medium [&_svg]:size-4"
            style={{
              left: viewportBox(mathCandidate, viewport).x,
              top: viewportBox(mathCandidate, viewport).y + mathCandidate.height * viewport.zoom + 6
            }}
            onClick={() => void math.typesetSelectedText()}
          >
            <Sigma aria-hidden /> Typeset as math
          </button>
        ) : null}
        {math.open ? (
          <ResearchFigureMathPopover
            key={math.open.key}
            title={math.open.target.kind === 'edit' ? 'Edit math' : 'New math'}
            initial={math.open.initial}
            initialPreview={math.open.preview}
            inks={math.open.inks}
            anchor={viewportBox(math.open.near, viewport)}
            onApply={math.apply}
            onCancel={math.cancel}
          />
        ) : null}
      </div>
      {inspector.visible ? (
        <ResearchFigureInspector
          context={inspector.context}
          onClose={inspector.close}
          onUndo={(redo) =>
            sendArrangeShortcut(containerRef.current?.querySelector('.excalidraw') ?? null, {
              key: 'z',
              mod: true,
              shift: redo
            })
          }
        />
      ) : null}
    </div>
  )
}
