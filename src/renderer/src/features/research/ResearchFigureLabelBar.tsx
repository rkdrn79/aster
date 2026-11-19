import { useEffect, useState } from 'react'
import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { AArrowDown, AArrowUp, Sigma } from 'lucide-react'
import { isAsterMathImage } from './research-figure-element-meta'
import { boxedLabels, labelAlignment } from './research-figure-label-align'
import { FIGURE_TEXT_STEP_PT, figureTextPt, figureTextTargets } from './research-figure-text-size'
import { LABEL_H_ALIGNS, LABEL_V_ALIGNS, labelEdits } from './ResearchFigureInspectorText'
import { viewportBox, type SceneBox } from './ResearchFigureCanvasOverlays'
import type { SettleScene } from './use-figure-inspector'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'

const BAR_HEIGHT = 32
const TOOL =
  'research-canvas-tool flex h-7 w-7 shrink-0 items-center justify-center rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 [&_svg]:size-3.5'

type Shown = { targets: ExcalidrawElement[]; anchor: SceneBox; editing: boolean }

function boundsOf(elements: readonly ExcalidrawElement[]): SceneBox {
  const x = Math.min(...elements.map((element) => element.x))
  const y = Math.min(...elements.map((element) => element.y))
  const right = Math.max(...elements.map((element) => element.x + element.width))
  const bottom = Math.max(...elements.map((element) => element.y + element.height))
  return { x, y, width: right - x, height: bottom - y }
}

/**
 * The label the bar works on: the text being typed, or a selection of labels only (a line,
 * a label group, its math). It sits over the label's box, so it never covers the label.
 */
function shownFor(elements: readonly ExcalidrawElement[], appState: AppState): Shown | null {
  if (appState.selectedElementsAreBeingDragged || appState.isResizing || appState.isRotating) {
    return null
  }
  const editing = appState.editingTextElement
  const live = editing ? elements.find((element) => element.id === editing.id) : null
  const selected = elements.filter(
    (element) => appState.selectedElementIds[element.id] && !element.isDeleted
  )
  const targets = live
    ? [live]
    : selected.length &&
        selected.every((element) => element.type === 'text' || isAsterMathImage(element))
      ? selected
      : []
  if (!targets.length || !figureTextTargets(targets, elements).length) {
    return null
  }
  const [box] = boxedLabels(targets, elements).map((label) => label.box)
  return { targets, anchor: box ?? boundsOf(targets), editing: Boolean(live) }
}

/**
 * PowerPoint's mini toolbar and Keynote's format bar over a selected or edited label: size in
 * points, half-point steps, alignment inside its box, and its math. Each is one undo step; it
 * hides while things are dragged.
 */
export function ResearchFigureLabelBar({
  api,
  settleEdit,
  hidden,
  onMath
}: {
  api: ExcalidrawImperativeAPI | null
  settleEdit: SettleScene
  hidden: boolean
  onMath: (targets: readonly ExcalidrawElement[]) => void
}): React.JSX.Element | null {
  const [state, setState] = useState<{ shown: Shown | null; appState: AppState | null }>({
    shown: null,
    appState: null
  })
  const [draft, setDraft] = useState<string | null>(null)
  /** While the pt field has focus the text editor has closed; the bar keeps its label. */
  const [pinned, setPinned] = useState<Shown | null>(null)
  useEffect(() => {
    if (!api) {
      return
    }
    let frame = 0
    const off = api.onChange((elements, appState) => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() =>
        setState({ shown: shownFor(elements, appState), appState })
      )
    })
    return () => {
      off()
      window.cancelAnimationFrame(frame)
    }
  }, [api])
  const shown = pinned ?? state.shown
  if (!api || hidden || !shown || !state.appState) {
    return null
  }
  const elements = api.getSceneElementsIncludingDeleted()
  const labels = figureTextTargets(shown.targets, elements)
  const pt = figureTextPt(labels)
  const boxed = boxedLabels(shown.targets, elements)
  const current = labelAlignment(boxed)
  const edits = labelEdits(shown.targets)
  const apply = (edit: (scene: readonly ExcalidrawElement[]) => ExcalidrawElement[]): void => {
    const scene = api.getSceneElementsIncludingDeleted()
    api.updateScene({
      elements: settleEdit(edit(scene), new Set(shown.targets.map((element) => element.id))),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })
  }
  const viewport = {
    scrollX: state.appState.scrollX,
    scrollY: state.appState.scrollY,
    zoom: state.appState.zoom.value
  }
  const box = viewportBox(shown.anchor, viewport)
  const above = box.y - BAR_HEIGHT - 8
  const top = above >= 4 ? above : box.y + box.height + 8
  const commit = (): void => {
    const value = Number(draft)
    if (draft !== null && draft.trim() !== '' && Number.isFinite(value)) {
      apply(edits.size(value))
    }
    setDraft(null)
  }
  return (
    <div
      role="toolbar"
      aria-label="Label"
      className="research-canvas-island absolute z-[6] flex h-8 -translate-x-1/2 items-center gap-0.5 rounded-xl px-1"
      style={{ left: Math.max(170, box.x + box.width / 2), top }}
      // Why: a press here must not take focus from the text being typed, which would end it.
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) {
          event.preventDefault()
        }
      }}
    >
      <label className="flex h-7 items-center gap-1 rounded-lg px-1.5 text-xs">
        <input
          aria-label="Label size in pt"
          inputMode="decimal"
          className="w-8 bg-transparent text-right tabular-nums outline-none"
          placeholder={pt === null ? 'Mixed' : undefined}
          value={draft ?? (pt === null ? '' : String(pt))}
          onFocus={() => setPinned(shown)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            commit()
            setPinned(null)
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (isImeOwnedKeyboardEvent(event)) {
              return
            }
            if (event.key === 'Enter') {
              commit()
            } else if (event.key === 'Escape') {
              setDraft(null)
            }
          }}
        />
        pt
      </label>
      <button
        type="button"
        className={TOOL}
        aria-label={`Label ${FIGURE_TEXT_STEP_PT} pt smaller`}
        title={`${FIGURE_TEXT_STEP_PT} pt smaller (⌘⇧<)`}
        onClick={() => apply(edits.step(-FIGURE_TEXT_STEP_PT))}
      >
        <AArrowDown aria-hidden />
      </button>
      <button
        type="button"
        className={TOOL}
        aria-label={`Label ${FIGURE_TEXT_STEP_PT} pt bigger`}
        title={`${FIGURE_TEXT_STEP_PT} pt bigger (⌘⇧>)`}
        onClick={() => apply(edits.step(FIGURE_TEXT_STEP_PT))}
      >
        <AArrowUp aria-hidden />
      </button>
      {boxed.length ? (
        <>
          <span className="research-canvas-divider mx-0.5 h-4 w-px" aria-hidden />
          {[...LABEL_H_ALIGNS, ...LABEL_V_ALIGNS].map(({ align, label, icon: Icon }) => (
            <button
              key={align}
              type="button"
              className={TOOL}
              aria-label={label}
              title={label}
              aria-pressed={current.h === align || current.v === align}
              onClick={() =>
                apply(
                  edits.align(
                    align === 'top' || align === 'middle' || align === 'bottom'
                      ? { v: align }
                      : { h: align }
                  )
                )
              }
            >
              <Icon aria-hidden />
            </button>
          ))}
        </>
      ) : null}
      <span className="research-canvas-divider mx-0.5 h-4 w-px" aria-hidden />
      <button
        type="button"
        className={TOOL}
        aria-label="Math: edit the label's math, or add math beside it"
        title="Math (M)"
        onClick={() => onMath(shown.targets)}
      >
        <Sigma aria-hidden />
      </button>
    </div>
  )
}

/** Σ on the bar: the label's math opens, `$…$` text is typeset, or new math goes beside it. */
export function runLabelMath(
  api: ExcalidrawImperativeAPI | null,
  targets: readonly ExcalidrawElement[],
  math: {
    editMath: (id: string) => Promise<void>
    typesetSelectedText: () => Promise<void>
    newMath: () => Promise<void>
  }
): void {
  const groups = new Set(
    targets.flatMap((target) => target.groupIds.filter((id) => id.endsWith('-label-group')))
  )
  const image = api
    ?.getSceneElements()
    .find(
      (element) =>
        isAsterMathImage(element) &&
        (targets.includes(element) || element.groupIds.some((id) => groups.has(id)))
    )
  const [only] = targets
  if (image) {
    void math.editMath(image.id)
  } else if (targets.length === 1 && only.type === 'text' && /\$[^$]+\$/.test(only.text)) {
    void math.typesetSelectedText()
  } else {
    void math.newMath()
  }
}
