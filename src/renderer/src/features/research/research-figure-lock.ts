import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import { attachmentOf } from './research-figure-element-meta'
import { hiddenMark } from './research-figure-layers'
import type { SceneBox } from './ResearchFigureCanvasOverlays'

const lockable = (element: ExcalidrawElement): boolean =>
  !element.isDeleted && element.id !== PAGE_FRAME_ID && element.type !== 'frame'

/**
 * What locking the selection reaches: the selected things, the labels bound in them, and what
 * follows them (badges, titles, arrow labels), so a locked box never leaves its badge loose.
 */
export function lockTargets(
  selected: readonly ExcalidrawElement[],
  elements: readonly ExcalidrawElement[]
): ExcalidrawElement[] {
  const live = elements.filter(lockable)
  const byId = new Map(live.map((element) => [element.id, element]))
  const ids = new Set(selected.filter(lockable).map((element) => element.id))
  return live.filter((element) => {
    if (ids.has(element.id)) {
      return true
    }
    if (element.type === 'text' && element.containerId && ids.has(element.containerId)) {
      return true
    }
    const attachment = attachmentOf(element, byId)
    return Boolean(attachment && ids.has(attachment.to))
  })
}

/** True when everything the selection reaches is locked (the next toggle unlocks). */
export function allLocked(targets: readonly ExcalidrawElement[]): boolean {
  return targets.length > 0 && targets.every((element) => element.locked)
}

export function withLock(
  elements: readonly ExcalidrawElement[],
  ids: ReadonlySet<string>,
  locked: boolean
): ExcalidrawElement[] {
  return elements.map((element) =>
    ids.has(element.id) && element.locked !== locked && lockable(element)
      ? newElementWith(element, { locked })
      : element
  )
}

/** Every locked element but the page frame, which stays locked, and hidden ones. */
export function lockedIds(elements: readonly ExcalidrawElement[]): string[] {
  return elements
    .filter((element) => lockable(element) && element.locked && !hiddenMark(element))
    .map((element) => element.id)
}

export type LockedSpot = { key: string; ids: string[]; box: SceneBox }

/**
 * The locked things on the canvas as a person sees them: a group (a panel with its title, a box
 * with its lines) or a lone element, with the box around it, for the lock glyph on hover.
 */
export function lockedSpots(elements: readonly ExcalidrawElement[]): LockedSpot[] {
  const live = elements.filter(lockable)
  const byId = new Map(live.map((element) => [element.id, element]))
  const spots = new Map<string, ExcalidrawElement[]>()
  for (const element of live) {
    if (
      !element.locked ||
      hiddenMark(element) ||
      (element.type === 'text' && element.containerId)
    ) {
      continue
    }
    const attachment = attachmentOf(element, byId)
    if (attachment && attachment.kind !== 'box-label' && byId.get(attachment.to)?.locked) {
      continue
    }
    const key = element.groupIds.at(-1) ?? element.id
    spots.set(key, [...(spots.get(key) ?? []), element])
  }
  return [...spots.entries()].map(([key, members]) => {
    const x = Math.min(...members.map((member) => member.x))
    const y = Math.min(...members.map((member) => member.y))
    const right = Math.max(...members.map((member) => member.x + member.width))
    const bottom = Math.max(...members.map((member) => member.y + member.height))
    return {
      key,
      ids: lockTargets(members, elements).map((element) => element.id),
      box: { x, y, width: right - x, height: bottom - y }
    }
  })
}

/**
 * Locks the selection (or unlocks it when all of it is locked) as one undo step; it stays
 * selected, so the Inspector shows "Locked" with its Unlock.
 */
export function toggleSelectionLock(api: ExcalidrawImperativeAPI): 'locked' | 'unlocked' | null {
  const elements = api.getSceneElementsIncludingDeleted()
  const ids = api.getAppState().selectedElementIds
  const selected = elements.filter((element) => ids[element.id] && !element.isDeleted)
  const targets = lockTargets(selected, elements)
  if (!targets.length) {
    return null
  }
  const locked = !allLocked(targets)
  api.updateScene({
    elements: withLock(elements, new Set(targets.map((element) => element.id)), locked),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY
  })
  api.setToast({
    message: locked ? 'Locked: clicks and selection boxes pass through it' : 'Unlocked',
    duration: 1600,
    closable: false
  })
  return locked ? 'locked' : 'unlocked'
}

/** Unlocks these elements (all locked ones when none are given) and selects them, as one step. */
export function unlockElements(api: ExcalidrawImperativeAPI, only?: readonly string[]): number {
  const elements = api.getSceneElementsIncludingDeleted()
  const ids = new Set(only ?? lockedIds(elements))
  if (!ids.size) {
    return 0
  }
  const groups = elements.flatMap((element) =>
    ids.has(element.id) && element.groupIds.length ? [element.groupIds.at(-1) ?? ''] : []
  )
  api.updateScene({
    elements: withLock(elements, ids, false),
    appState: {
      selectedElementIds: Object.fromEntries(
        elements
          .filter(
            (element) => ids.has(element.id) && !(element.type === 'text' && element.containerId)
          )
          .map((element) => [element.id, true] as const)
      ),
      selectedGroupIds: Object.fromEntries(groups.map((group) => [group, true] as const)),
      editingGroupId: null
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY
  })
  return ids.size
}
