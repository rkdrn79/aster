import { useCallback, useRef } from 'react'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import {
  boundsOf,
  duplicateBadges,
  firstDuplicateOffset,
  placeDuplicates,
  type Offset
} from './research-figure-duplicate'

type Job = { sources: ExcalidrawElement[]; offset: Offset }
type Last = { sourceIds: string[]; copyIds: string[] }

const notBoundText = (element: ExcalidrawElement): boolean =>
  !(element.type === 'text' && element.containerId)

function sameIds(a: readonly string[], b: ReadonlySet<string>): boolean {
  return a.length === b.size && a.every((id) => b.has(id))
}

/**
 * PowerPoint's and Figma's smart duplicate, Illustrator's Transform Again: ⌘D puts the copy one
 * box-height (or width, in a row) plus the gap beside the original; when the copy is moved and
 * ⌘D pressed again, the next copy repeats that move. Badges come along with their boxes.
 */
export function useFigureDuplicate(apiRef: React.RefObject<ExcalidrawImperativeAPI | null>) {
  const job = useRef<Job | null>(null)
  const last = useRef<Last | null>(null)

  /** Heard on ⌘D before Excalidraw duplicates: decides where the copy goes. */
  const prepare = useCallback(() => {
    const api = apiRef.current
    if (!api) {
      return
    }
    const elements = api.getSceneElements()
    const ids = api.getAppState().selectedElementIds
    const sources = elements.filter((element) => ids[element.id] && element.id !== PAGE_FRAME_ID)
    if (!sources.length) {
      return
    }
    const selectedIds = new Set(sources.filter(notBoundText).map((element) => element.id))
    let offset: Offset | null = null
    const previous = last.current
    if (previous && sameIds(previous.copyIds, selectedIds)) {
      const originals = elements.filter((element) => previous.sourceIds.includes(element.id))
      if (originals.length) {
        const from = boundsOf(originals)
        const to = boundsOf(sources)
        offset = { dx: to.x - from.x, dy: to.y - from.y }
      }
    }
    job.current = {
      sources,
      offset: offset ?? firstDuplicateOffset(boundsOf(sources), selectedIds, elements)
    }
    // Why: Excalidraw duplicates in this same key event; a ⌘D it ignores leaves nothing pending.
    window.setTimeout(() => {
      job.current = null
    }, 0)
  }, [apiRef])

  /** Excalidraw's `onDuplicate`: moves the copies made for ⌘D and adds their badges. */
  const onDuplicate = useCallback(
    (next: readonly ExcalidrawElement[], previous: readonly ExcalidrawElement[]) => {
      const current = job.current
      if (!current) {
        // Why: an Alt-drag copy goes where the pointer puts it.
        return undefined
      }
      job.current = null
      const placed = placeDuplicates(next, previous, current.offset)
      const badges = duplicateBadges(previous, current.sources, placed.copies, current.offset)
      last.current = {
        sourceIds: current.sources.filter(notBoundText).map((element) => element.id),
        copyIds: placed.copies.filter(notBoundText).map((element) => element.id)
      }
      return [...placed.elements, ...badges]
    },
    []
  )

  return { prepare, onDuplicate }
}
