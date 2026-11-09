import { useCallback, useRef, useState } from 'react'
import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw'
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { areaAnswered, areaChildrenKey } from './research-figure-document'
import {
  sendFigureAreaRequest,
  sendFigureSelectionRequest,
  type FigureRequestHost
} from './research-figure-requests'

export type FigureAsk = { kind: 'area'; frameId: string; created: boolean } | { kind: 'selection' }
export type FigureFrameBox = { id: string; x: number; y: number; width: number; height: number }

/** The areas the agent is still filling: area id → its children when it was asked. */
export function useFigurePendingAreas() {
  const [pending, setPending] = useState<Record<string, string>>({})

  /** After the file changed: an area whose children changed is answered. */
  const onExternalChange = useCallback((api: ExcalidrawImperativeAPI) => {
    const elements = api.getSceneElements()
    setPending((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([id, key]) => !areaAnswered(elements, id, key))
      )
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [])

  const markPending = useCallback(
    (id: string, key: string) => setPending((current) => ({ ...current, [id]: key })),
    []
  )

  const dismiss = useCallback(
    (id: string) =>
      setPending((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => key !== id))
      ),
    []
  )

  return { pending, onExternalChange, markPending, dismiss }
}

/**
 * Generate in area and Ask about selection: the area tool, the prompt box, and Regenerate /
 * Remove area on a filled one.
 */
export function useFigureAsk(input: {
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>
  noteUserInput: () => void
  onAgentAsked: () => void
  /** Puts focus back on the canvas after the prompt box closes. */
  focusCanvas: () => void
  markPending: (id: string, key: string) => void
}) {
  const { apiRef, noteUserInput, onAgentAsked, focusCanvas, markPending } = input
  const [areaMode, setAreaMode] = useState(false)
  const areaModeRef = useRef(false)
  const knownFramesRef = useRef(new Set<string>())
  const [ask, setAsk] = useState<FigureAsk | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  /** From the canvas's onChange: a frame drawn with the area tool opens the prompt box. */
  const noteFrames = useCallback((boxes: readonly FigureFrameBox[], appState: AppState) => {
    if (!areaModeRef.current || appState.newElement) {
      return
    }
    const created = boxes.find((box) => !knownFramesRef.current.has(box.id))
    if (created || appState.activeTool.type !== 'frame') {
      areaModeRef.current = false
      setAreaMode(false)
    }
    if (created) {
      setError(null)
      setAsk({ kind: 'area', frameId: created.id, created: true })
    }
  }, [])

  function startArea(selectedFrameId: string | null): void {
    const api = apiRef.current
    if (!api) {
      return
    }
    if (selectedFrameId) {
      setError(null)
      setAsk({ kind: 'area', frameId: selectedFrameId, created: false })
      return
    }
    if (areaModeRef.current) {
      areaModeRef.current = false
      setAreaMode(false)
      api.setActiveTool({ type: 'selection' })
      return
    }
    knownFramesRef.current = new Set(
      api
        .getSceneElements()
        .filter((element) => element.type === 'frame')
        .map((element) => element.id)
    )
    areaModeRef.current = true
    setAreaMode(true)
    api.setActiveTool({ type: 'frame' })
  }

  function askSelection(): void {
    setError(null)
    setAsk({ kind: 'selection' })
  }

  function cancel(): void {
    const api = apiRef.current
    if (api && ask?.kind === 'area' && ask.created) {
      api.updateScene({
        elements: api
          .getSceneElementsIncludingDeleted()
          .map((element) =>
            element.id === ask.frameId ? newElementWith(element, { isDeleted: true }) : element
          ),
        captureUpdate: CaptureUpdateAction.NEVER
      })
    }
    setAsk(null)
    focusCanvas()
  }

  async function sendArea(host: FigureRequestHost, frameId: string, prompt: string) {
    const failure = await sendFigureAreaRequest(host, frameId, prompt)
    const api = apiRef.current
    if (!failure && api) {
      markPending(frameId, areaChildrenKey(api.getSceneElements(), frameId))
    }
    return failure
  }

  async function send(host: FigureRequestHost, prompt: string): Promise<void> {
    if (!ask) {
      return
    }
    setSending(true)
    noteUserInput()
    const failure =
      ask.kind === 'area'
        ? await sendArea(host, ask.frameId, prompt)
        : await sendFigureSelectionRequest(host, prompt)
    setSending(false)
    if (failure) {
      setError(failure)
      return
    }
    setAsk(null)
    focusCanvas()
    onAgentAsked()
  }

  /** Asks again for a filled area with the prompt it was filled from. */
  async function regenerate(host: FigureRequestHost, frameId: string, prompt: string) {
    const failure = await sendArea(host, frameId, prompt)
    if (failure) {
      setError(failure)
      setAsk({ kind: 'area', frameId, created: false })
    } else {
      onAgentAsked()
    }
  }

  /** Drops an area's frame and keeps what is drawn in it. */
  function removeArea(frameId: string): void {
    const api = apiRef.current
    if (!api) {
      return
    }
    noteUserInput()
    api.updateScene({
      elements: api
        .getSceneElementsIncludingDeleted()
        .map((element) =>
          element.id === frameId
            ? newElementWith(element, { isDeleted: true })
            : element.frameId === frameId
              ? newElementWith(element, { frameId: null })
              : element
        ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })
  }

  return {
    ask,
    error,
    sending,
    areaMode,
    noteFrames,
    startArea,
    askSelection,
    cancel,
    send,
    regenerate,
    removeArea
  }
}
