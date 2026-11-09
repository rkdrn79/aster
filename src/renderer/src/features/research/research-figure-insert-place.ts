import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  getCommonBounds,
  newElementWith
} from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { PAGE_FRAME_ID, figurePage } from '../../../../research-harness/research-figures-model.mjs'
import { attachmentOf } from './research-figure-element-meta'
import type { BuiltItem } from './research-figure-insert-catalog'
import { routeOrthogonal, type Point } from './research-figure-orthogonal-route'
import { localPoints } from './research-figure-scene-updates'
import type { SceneBox } from './ResearchFigureCanvasOverlays'

type SettleEdit = (
  elements: readonly ExcalidrawElement[],
  selected?: ReadonlySet<string>
) => ExcalidrawElement[]

/** Room kept around an inserted item. */
const MARGIN = 12
const STEP = 8

function boxOf(elements: readonly ExcalidrawElement[]): SceneBox {
  const [minX, minY, maxX, maxY] = getCommonBounds(elements)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

const overlaps = (a: SceneBox, b: SceneBox, margin: number): boolean =>
  a.x < b.x + b.width + margin &&
  b.x < a.x + a.width + margin &&
  a.y < b.y + b.height + margin &&
  b.y < a.y + a.height + margin

/**
 * Where a new item of `size` goes: right of the selection, else the free spot on the page that
 * keeps farthest from everything (the largest gap), else the page's middle.
 */
export function insertionPoint(
  api: ExcalidrawImperativeAPI,
  size: { width: number; height: number }
) {
  const elements = api.getSceneElements()
  const ids = api.getAppState().selectedElementIds
  const selected = elements.filter((element) => ids[element.id] && element.id !== PAGE_FRAME_ID)
  if (selected.length) {
    const box = boxOf(selected)
    return { x: box.x + box.width + 2 * MARGIN, y: box.y + box.height / 2 - size.height / 2 }
  }
  const page = figurePage(elements)
  if (!page) {
    return { x: 0, y: 0 }
  }
  const taken = elements
    .filter((element) => element.type !== 'frame')
    .map((element) => boxOf([element]))
  let best: { x: number; y: number; room: number } | null = null
  for (let y = page.y + MARGIN; y + size.height <= page.y + page.height - MARGIN; y += STEP) {
    for (let x = page.x + MARGIN; x + size.width <= page.x + page.width - MARGIN; x += STEP) {
      const candidate = { x, y, width: size.width, height: size.height }
      if (taken.some((box) => overlaps(candidate, box, MARGIN))) {
        continue
      }
      const room = Math.min(
        200,
        ...taken.map((box) =>
          Math.hypot(
            Math.max(0, box.x - (x + size.width), x - (box.x + box.width)),
            Math.max(0, box.y - (y + size.height), y - (box.y + box.height))
          )
        )
      )
      if (!best || room > best.room + 0.5) {
        best = { x, y, room }
      }
    }
  }
  return (
    best ?? {
      x: page.x + (page.width - size.width) / 2,
      y: page.y + (page.height - size.height) / 2
    }
  )
}

/** The elements with new ids (and group ids), every reference between them kept. */
export function withFreshIds(
  elements: readonly ExcalidrawElement[],
  suffix: string
): ExcalidrawElement[] {
  const ids = new Map(elements.map((element) => [element.id, `${element.id}~${suffix}`]))
  const group = (id: string): string => `${id}~${suffix}`
  const mapped = (id: string | null | undefined): string | null => (id ? (ids.get(id) ?? id) : null)
  return elements.map((element) => {
    const customData = element.customData
      ? Object.fromEntries(
          Object.entries(element.customData).map(([key, value]) =>
            key === 'asterKit' && typeof value === 'string'
              ? [key, mapped(value)]
              : key === 'asterAttach' && typeof value === 'object' && value !== null
                ? [key, { ...value, to: mapped(String(Reflect.get(value, 'to'))) }]
                : [key, value]
          )
        )
      : element.customData
    const base = {
      ...element,
      id: ids.get(element.id) ?? element.id,
      groupIds: element.groupIds.map(group),
      frameId: null,
      customData,
      boundElements:
        element.boundElements?.map((bound) => ({ ...bound, id: mapped(bound.id) ?? bound.id })) ??
        null
    }
    if (base.type === 'text') {
      return { ...base, containerId: mapped(base.containerId) }
    }
    if (base.type === 'arrow') {
      return {
        ...base,
        startBinding: base.startBinding
          ? { ...base.startBinding, elementId: mapped(base.startBinding.elementId) ?? '' }
          : null,
        endBinding: base.endBinding
          ? { ...base.endBinding, elementId: mapped(base.endBinding.elementId) ?? '' }
          : null
      }
    }
    return base
  })
}

function moved(
  elements: readonly ExcalidrawElement[],
  dx: number,
  dy: number
): ExcalidrawElement[] {
  return elements.map((element) =>
    newElementWith(element, { x: element.x + dx, y: element.y + dy })
  )
}

/** The main shape of an inserted item (what an arrow connects to). */
function primaryOf(elements: readonly ExcalidrawElement[]): ExcalidrawElement | null {
  const byId = new Map(elements.map((element) => [element.id, element]))
  return (
    elements
      .filter(
        (element) =>
          element.type !== 'arrow' && element.type !== 'line' && !attachmentOf(element, byId)
      )
      .toSorted((a, b) => b.width * b.height - a.width * a.height)[0] ?? null
  )
}

/** An orthogonal arrow bound from one shape to another, as the kit draws connectors. */
function connector(
  from: ExcalidrawElement,
  to: ExcalidrawElement,
  line: string
): ExcalidrawElement[] {
  const side =
    to.x >= from.x + from.width
      ? 'right'
      : to.x + to.width <= from.x
        ? 'left'
        : to.y > from.y
          ? 'bottom'
          : 'top'
  const entry = { right: 'left', left: 'right', bottom: 'top', top: 'bottom' } as const
  const path: Point[] = routeOrthogonal(
    { kind: 'shape', box: from, side, t: 0.5, round: from.type === 'ellipse' },
    { kind: 'shape', box: to, side: entry[side], t: 0.5, round: to.type === 'ellipse' },
    4
  )
  const [x, y] = path[0]
  const [arrow] = convertToExcalidrawElements([
    {
      type: 'arrow',
      x,
      y,
      endArrowhead: 'triangle',
      roundness: null,
      strokeWidth: 2,
      strokeColor: line
    }
  ])
  const points = localPoints(path.map(([px, py]) => [px - x, py - y] as const))
  const xs = points.map((point) => point[0])
  const ys = points.map((point) => point[1])
  return [
    newElementWith(from, {
      boundElements: [...(from.boundElements ?? []), { id: arrow.id, type: 'arrow' }]
    }),
    newElementWith(to, {
      boundElements: [...(to.boundElements ?? []), { id: arrow.id, type: 'arrow' }]
    }),
    arrow.type === 'arrow'
      ? newElementWith(arrow, {
          points,
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
          startBinding: { elementId: from.id, focus: 0, gap: 4 },
          endBinding: { elementId: to.id, focus: 0, gap: 4 }
        })
      : arrow
  ]
}

/**
 * Puts a built item on the canvas (at `at`, its middle, or where `insertionPoint` finds room),
 * selects it, and with `connect` draws an arrow to it from the one selected shape. One undo step.
 */
export function placeInsertItem(
  api: ExcalidrawImperativeAPI,
  built: BuiltItem,
  settle: SettleEdit,
  options: {
    at?: { x: number; y: number }
    connect?: boolean
    group?: boolean
    /** The figure style's line colour, for a connecting arrow. */
    line?: string
  } = {}
): void {
  if (!built.elements.length) {
    return
  }
  const fresh = withFreshIds(built.elements, Math.random().toString(36).slice(2, 7))
  const box = boxOf(fresh)
  const target = options.at
    ? { x: options.at.x - box.width / 2, y: options.at.y - box.height / 2 }
    : insertionPoint(api, box)
  let placed = moved(fresh, target.x - box.x, target.y - box.y)
  if (options.group) {
    const groupId = `insert~${Math.random().toString(36).slice(2, 9)}`
    placed = placed.map((element) =>
      newElementWith(element, { groupIds: [...element.groupIds, groupId] })
    )
  }
  if (built.files.length) {
    api.addFiles(built.files)
  }
  const appState = api.getAppState()
  const selected = api
    .getSceneElements()
    .filter((element) => appState.selectedElementIds[element.id] && element.id !== PAGE_FRAME_ID)
  let scene = [...api.getSceneElementsIncludingDeleted(), ...placed]
  const from = options.connect && selected.length ? primaryOf(selected) : null
  const to = primaryOf(placed)
  if (from && to) {
    const [start, end, arrow] = connector(from, to, options.line ?? '#585858')
    scene = [
      ...scene.map((element) =>
        element.id === start.id ? start : element.id === end.id ? end : element
      ),
      arrow
    ]
  }
  const ids = new Set(placed.map((element) => element.id))
  api.updateScene({
    elements: settle(scene, ids),
    appState: {
      selectedElementIds: Object.fromEntries([...ids].map((id) => [id, true])),
      selectedGroupIds: {}
    },
    captureUpdate: CaptureUpdateAction.IMMEDIATELY
  })
}
