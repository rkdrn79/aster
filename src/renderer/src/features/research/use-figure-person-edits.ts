import { useCallback, useEffect, useRef } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { noteFigureEditorOpen } from './research-figure-background-render'
import { loadFigurePersonEdits, recordFigurePersonEdits } from './research-figure-person-edits'
import { onFigureSceneReplaced } from './research-figure-scene-replace'
import type { FigureTarget } from './research-figures-export'

function versionsOf(elements: readonly ExcalidrawElement[]): Map<string, number> {
  return new Map(elements.map((element) => [element.id, element.version]))
}

/**
 * Which elements the person changed on the canvas: those whose version moved since the canvas
 * last took a file or a replacement (an agent's write, a merge, a restore). Excalidraw rewriting a
 * file as it loads it, or the agent's own changes, are never taken for the person's edits.
 */
export function useFigurePersonEditTracking(target: FigureTarget) {
  const baselineRef = useRef<Map<string, number>>(new Map())
  const mineRef = useRef<Set<string>>(new Set())
  const unsubscribeRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    void loadFigurePersonEdits(target).catch(() => undefined)
    return noteFigureEditorOpen(target)
  }, [target])
  useEffect(() => () => unsubscribeRef.current?.(), [])

  const rebaseline = useCallback((api: ExcalidrawImperativeAPI) => {
    baselineRef.current = versionsOf(api.getSceneElementsIncludingDeleted())
  }, [])

  const touched = useCallback((api: ExcalidrawImperativeAPI): Set<string> => {
    const ids = new Set(mineRef.current)
    const seen = new Set<string>()
    for (const element of api.getSceneElementsIncludingDeleted()) {
      seen.add(element.id)
      if (baselineRef.current.get(element.id) !== element.version) {
        ids.add(element.id)
      }
    }
    for (const id of baselineRef.current.keys()) {
      if (!seen.has(id)) {
        ids.add(id)
      }
    }
    return ids
  }, [])

  const attach = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      unsubscribeRef.current?.()
      rebaseline(api)
      unsubscribeRef.current = onFigureSceneReplaced(api, () => rebaseline(api))
    },
    [rebaseline]
  )

  /** The canvas takes a file as it is (nothing of the person's is unsaved). */
  const reset = useCallback(
    (api: ExcalidrawImperativeAPI) => {
      mineRef.current = new Set()
      rebaseline(api)
    },
    [rebaseline]
  )

  /** Before a merge replaces the canvas: what the person changed and has not saved yet. */
  const keepMine = useCallback(
    (api: ExcalidrawImperativeAPI): Set<string> => {
      const ids = touched(api)
      return ids
    },
    [touched]
  )

  const noteMine = useCallback((ids: Iterable<string>) => {
    for (const id of ids) {
      mineRef.current.add(id)
    }
  }, [])

  /** After the person's save: records what they changed since the file they started from. */
  const saved = useCallback(
    (api: ExcalidrawImperativeAPI, baseText: string, savedText: string) => {
      const ids = touched(api)
      mineRef.current = new Set()
      rebaseline(api)
      void recordFigurePersonEdits(target, { baseText, savedText, touched: ids }).catch(
        () => undefined
      )
    },
    [target, touched, rebaseline]
  )

  return { attach, reset, keepMine, noteMine, saved }
}
