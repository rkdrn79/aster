import { useCallback, useSyncExternalStore } from 'react'
import { useFigureEditorHandle } from './research-figure-editor-handle'
import { figureCanvasState, type FigureCanvasState } from './research-figure-quick-actions'

const NO_SUBSCRIPTION = (): (() => void) => () => undefined

/** What is on the open figure's canvas (none, an empty page, a sketch, a drawing), kept current. */
export function useFigureCanvasState(slug: string | null): FigureCanvasState {
  const handle = useFigureEditorHandle((state) => state.handle)
  const api = handle && slug && handle.target.slug === slug ? handle.api : null
  const subscribe = useCallback(
    (onStoreChange: () => void) => (api ? api.onChange(onStoreChange) : NO_SUBSCRIPTION()),
    [api]
  )
  return useSyncExternalStore(subscribe, () =>
    api ? figureCanvasState(api.getSceneElements()) : 'none'
  )
}
