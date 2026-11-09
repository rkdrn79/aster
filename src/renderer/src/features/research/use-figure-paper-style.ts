import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { figurePage } from '../../../../research-harness/research-figures-model.mjs'
import { hasRedLoss } from '../../../../research-harness/research-figures-style.mjs'
import { useFigureEditorHandle } from './research-figure-editor-handle'

export type FigurePaperStyle = {
  style: string | null
  accent: string | null
  panels: string[] | null
  /** Who chose the style: the person (the agent keeps it), the agent, or nobody (the default). */
  styleBy: 'person' | 'agent' | null
  /** The figure draws a red loss, so an accent near red would turn it to ink. */
  redLoss: boolean
}

const NO_SUBSCRIPTION = (): (() => void) => () => undefined

/** The open figure's paper style as its page records it, kept current; null without a page. */
export function useFigurePaperStyle(): FigurePaperStyle | null {
  const api = useFigureEditorHandle((state) => state.handle?.api ?? null)
  const subscribe = useCallback(
    (onChange: () => void) => (api ? api.onChange(onChange) : NO_SUBSCRIPTION()),
    [api]
  )
  const key = useSyncExternalStore(subscribe, () => {
    const elements = api?.getSceneElements() ?? []
    const page = api ? figurePage(elements) : null
    return page
      ? JSON.stringify({
          style: page.style,
          accent: page.accent,
          panels: page.panels,
          styleBy: page.styleBy,
          redLoss: hasRedLoss(elements)
        })
      : ''
  })
  return useMemo(() => {
    if (!key) {
      return null
    }
    const parsed: FigurePaperStyle = JSON.parse(key)
    return parsed
  }, [key])
}
