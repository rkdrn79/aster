import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { figurePage } from '../../../../research-harness/research-figures-model.mjs'
import { figureStyle } from '../../../../research-harness/research-figures-style.mjs'
import {
  fitFigureInView,
  setFigureViewInset,
  viewStillFitted
} from './research-figure-editor-config'
import type { InspectorContext } from './research-figure-inspector-registry'
import { toggleFiguresFocus, useFiguresLayout } from './research-figures-layout-mode'
import type { ProjectFileOwner } from './research-project-files'
import type { Inspected } from './use-figure-canvas-observer'

const PREFERENCE_KEY = 'aster.research-figures-inspector.v1'
export const INSPECTOR_WIDTH = 248
/**
 * The narrowest canvas the Inspector lies over. Below about 730 px Excalidraw switches to its
 * phone layout, whose bottom bar (undo, redo) and toolbar would sit under the column; from here
 * up its bars move into the 490 px left beside it. On a narrower canvas (a 1280 or 1440 px window
 * with the side panel docked) the Inspector does not open by itself, ⌘I or its button opens it
 * in focus mode, and one showing folds away when the canvas narrows.
 */
export const INSPECTOR_MIN_CANVAS = 740
/** Longer than a double-click, so opening (and the re-fit) never lands between its clicks. */
const AUTO_OPEN_DELAY_MS = 450
/** auto: opens with the first selection; open/closed: the person's ⌘I. */
type Preference = 'auto' | 'open' | 'closed'

function readPreference(): Preference {
  try {
    return localStorage.getItem(PREFERENCE_KEY) === 'closed' ? 'closed' : 'auto'
  } catch {
    return 'auto'
  }
}

export type SettleScene = (
  elements: readonly ExcalidrawElement[],
  selected?: ReadonlySet<string>
) => ExcalidrawElement[]

/** True while the canvas is wide enough for the Inspector beside its bars. */
function useRoomyCanvas(containerRef: React.RefObject<HTMLDivElement | null>): boolean {
  const [roomy, setRoomy] = useState(true)
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }
    const observer = new ResizeObserver(([entry]) =>
      setRoomy(entry.contentRect.width >= INSPECTOR_MIN_CANVAS)
    )
    observer.observe(container)
    return () => observer.disconnect()
  }, [containerRef])
  return roomy
}

/** Whether the Inspector shows, ⌘I, and the context its sections edit through. */
export function useFigureInspector(
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  settleEdit: SettleScene,
  inspected: Inspected,
  project: { owner: ProjectFileOwner; folder: string }
) {
  const [preference, setPreference] = useState<Preference>(readPreference)
  const [autoOpened, setAutoOpened] = useState(false)
  const roomy = useRoomyCanvas(containerRef)
  const focus = useFiguresLayout((state) => state.focus)
  /** Focus mode was turned on to make room for the Inspector, and goes when it closes. */
  const focusForInspector = useRef(false)
  const timer = useRef(0)
  // Why focus counts: it is all the room the window has; past that the person's ⌘I wins.
  const visible =
    (preference === 'open' && (roomy || focus)) || (preference === 'auto' && autoOpened && roomy)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  /** After a pointer or key, opens once something is selected (the first time only). */
  const noteInteraction = useCallback(() => {
    window.clearTimeout(timer.current)
    if (preference !== 'auto' || autoOpened || !roomy) {
      return
    }
    timer.current = window.setTimeout(() => {
      const selected = apiRef.current?.getAppState().selectedElementIds ?? {}
      if (Object.values(selected).some(Boolean)) {
        setAutoOpened(true)
      }
    }, AUTO_OPEN_DELAY_MS)
  }, [apiRef, preference, autoOpened, roomy])
  const store = useCallback((next: Preference) => {
    setPreference(next)
    try {
      localStorage.setItem(PREFERENCE_KEY, next)
    } catch {
      // The Inspector still toggles for this session.
    }
  }, [])
  const close = useCallback(() => {
    store('closed')
    if (focusForInspector.current && useFiguresLayout.getState().focus) {
      toggleFiguresFocus()
    }
    focusForInspector.current = false
  }, [store])
  const toggle = useCallback(() => {
    if (visible) {
      close()
      return
    }
    store('open')
    if (!roomy && !useFiguresLayout.getState().focus) {
      focusForInspector.current = true
      toggleFiguresFocus()
    }
  }, [store, close, visible, roomy])
  useEffect(() => {
    // Why: the column sits over the canvas's right edge (a narrower canvas would switch
    // Excalidraw to its phone layout), so the page is re-fitted clear of it.
    const api = apiRef.current
    if (!api) {
      return
    }
    const fitted = viewStillFitted(api)
    setFigureViewInset(api, visible ? INSPECTOR_WIDTH : 0)
    if (fitted) {
      fitFigureInView(api)
    }
  }, [apiRef, visible])

  const context = useMemo<InspectorContext>(() => {
    const page = figurePage(inspected.elements)
    const ids = new Set(inspected.selected.map((element) => element.id))
    return {
      selected: inspected.selected,
      elements: inspected.elements,
      page,
      style: figureStyle(page?.style, page?.accent),
      project,
      api: () => apiRef.current,
      commit: (next) =>
        apiRef.current?.updateScene({
          elements: settleEdit(next, ids),
          captureUpdate: CaptureUpdateAction.IMMEDIATELY
        })
    }
  }, [inspected, project, apiRef, settleEdit])

  return { visible, toggle, close, context, noteInteraction }
}
