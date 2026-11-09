import { useCallback, useEffect, useState } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { toast } from 'sonner'
import type { FigureStyle } from '../../../../research-harness/research-figures-style.mjs'
import { onFigureCommand } from './research-figure-commands'
import {
  buildInsertItem,
  iconItems,
  partItems,
  templateItems,
  type InsertItem
} from './research-figure-insert-catalog'
import { placeInsertItem } from './research-figure-insert-place'
import { isTypingTarget } from './use-figure-attachments'
import { INSERT_DRAG_TYPE } from './ResearchFigureInsertTile'

type Settle = (
  elements: readonly ExcalidrawElement[],
  selected?: ReadonlySet<string>
) => ExcalidrawElement[]

async function itemFor(key: string): Promise<InsertItem | null> {
  const known = [...partItems(), ...iconItems()].find((item) => item.key === key)
  if (known) {
    return known
  }
  return (await templateItems()).find((item) => item.key === key) ?? null
}

/** The canvas's Insert popover (I, the Insert button, the toolbar's parts) and tile drops. */
export function useFigureInsert(
  apiRef: React.RefObject<ExcalidrawImperativeAPI | null>,
  settle: Settle,
  style: FigureStyle
) {
  const [open, setOpen] = useState(false)
  useEffect(() => onFigureCommand((command) => command === 'insert-parts' && setOpen(true)), [])

  const onKey = useCallback((event: React.KeyboardEvent): boolean => {
    if (
      (event.key === 'i' || event.key === 'I') &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !isTypingTarget(event.target)
    ) {
      // Why stop: Excalidraw's I is its eyedropper.
      event.preventDefault()
      event.stopPropagation()
      setOpen((current) => !current)
      return true
    }
    return false
  }, [])

  const onDragOver = useCallback((event: React.DragEvent): boolean => {
    if (event.dataTransfer?.types.includes(INSERT_DRAG_TYPE)) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      return true
    }
    return false
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent): boolean => {
      const key = event.dataTransfer?.getData(INSERT_DRAG_TYPE)
      const api = apiRef.current
      if (!key || !api) {
        return false
      }
      event.preventDefault()
      event.stopPropagation()
      const state = api.getAppState()
      const at = {
        x: (event.clientX - state.offsetLeft) / state.zoom.value - state.scrollX,
        y: (event.clientY - state.offsetTop) / state.zoom.value - state.scrollY
      }
      void itemFor(key)
        .then(async (item) => {
          if (item) {
            placeInsertItem(api, await buildInsertItem(item, style), settle, {
              at,
              group: item.category === 'templates',
              line: style.line
            })
          }
        })
        .catch((cause: unknown) =>
          toast.error(cause instanceof Error ? cause.message : String(cause))
        )
      return true
    },
    [apiRef, settle, style]
  )

  return { open, setOpen, onKey, onDragOver, onDrop }
}
