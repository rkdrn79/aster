import { useCallback, useSyncExternalStore } from 'react'
import { figurePage } from '../../../../research-harness/research-figures-model.mjs'
import { useFigureEditorHandle } from './research-figure-editor-handle'

const NO_SUBSCRIPTION = (): (() => void) => () => undefined

/** The open figure's printed page size, kept current; null without an open page. */
export function useFigurePageSize(): { widthIn: number; heightIn: number } | null {
  const api = useFigureEditorHandle((state) => state.handle?.api ?? null)
  const subscribe = useCallback(
    (onChange: () => void) => (api ? api.onChange(onChange) : NO_SUBSCRIPTION()),
    [api]
  )
  const key = useSyncExternalStore(subscribe, () => {
    const page = api ? figurePage(api.getSceneElements()) : null
    return page ? `${page.widthIn}x${page.heightIn}` : ''
  })
  if (!key) {
    return null
  }
  const [widthIn, heightIn] = key.split('x').map(Number)
  return { widthIn, heightIn }
}
