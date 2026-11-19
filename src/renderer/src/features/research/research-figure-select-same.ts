import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import type { FigureStyle } from '../../../../research-harness/research-figures-style.mjs'
import { badgeOf } from './research-figure-badges'
import { attachmentOf } from './research-figure-element-meta'
import { kindOf, roleOf } from './research-figure-roles'

/** What "select same" matches on, like Figma's Select matching and Illustrator's Select › Same. */
export type SameKey = 'look' | 'fill' | 'line' | 'badge' | 'text' | 'kind'

/** One thing a person picks on the canvas: a group, a box (with its bound label), an arrow. */
type Unit = { key: string; group: boolean; ids: string[]; primary: ExcalidrawElement }

const SHAPE_TYPES = new Set(['rectangle', 'ellipse', 'diamond'])

function pickable(element: ExcalidrawElement, byId: ReadonlyMap<string, ExcalidrawElement>) {
  if (element.isDeleted || element.locked || element.type === 'frame') {
    return false
  }
  if (element.id === PAGE_FRAME_ID || (element.type === 'text' && element.containerId)) {
    return false
  }
  // Why: badges and arrow labels ride with their owner; they are not picked on their own.
  const attachment = attachmentOf(element, byId)
  return !attachment || attachment.kind === 'box-label' || attachment.kind === 'title'
}

function rank(element: ExcalidrawElement): number {
  return SHAPE_TYPES.has(element.type) || element.type === 'image'
    ? 2
    : element.type === 'arrow' || element.type === 'line'
      ? 1
      : 0
}

function unitsOf(
  elements: readonly ExcalidrawElement[],
  among: readonly ExcalidrawElement[]
): Unit[] {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const units = new Map<string, ExcalidrawElement[]>()
  for (const element of among) {
    if (!pickable(element, byId)) {
      continue
    }
    const key = element.groupIds.at(-1) ?? element.id
    units.set(key, [...(units.get(key) ?? []), element])
  }
  return [...units.entries()].map(([key, members]) => ({
    key,
    group: members[0].groupIds.at(-1) === key,
    ids: members.map((member) => member.id),
    // Why the biggest shape: a box with its label lines and math is "a box".
    primary: members.toSorted(
      (a, b) => rank(b) - rank(a) || b.width * b.height - a.width * a.height
    )[0]
  }))
}

function textSizes(unit: Unit, elements: readonly ExcalidrawElement[]): number[] {
  const ids = new Set(unit.ids)
  return elements.flatMap((element) =>
    element.type === 'text' &&
    !element.isDeleted &&
    (ids.has(element.id) || (element.containerId !== null && ids.has(element.containerId)))
      ? [Math.round(element.fontSize * 10)]
      : []
  )
}

function kindKey(element: ExcalidrawElement): string {
  return kindOf(element) ?? element.type
}

/** The values a unit has for `key`; units match when they share kind and one value. */
function valuesOf(
  unit: Unit,
  key: SameKey,
  elements: readonly ExcalidrawElement[],
  style: FigureStyle
): string[] {
  const { primary } = unit
  switch (key) {
    case 'kind':
      return [kindKey(primary)]
    case 'fill':
      return SHAPE_TYPES.has(primary.type) ? [primary.backgroundColor] : []
    case 'line':
      return [`${primary.strokeColor}|${primary.strokeStyle}|${primary.strokeWidth}`]
    case 'badge': {
      const badge = SHAPE_TYPES.has(primary.type) ? badgeOf(elements, primary.id) : null
      return badge ? [badge] : []
    }
    case 'text':
      return textSizes(unit, elements).map(String)
    case 'look': {
      const role = roleOf(primary, style)
      if (role && kindOf(primary) !== 'text') {
        return [`role:${role}`]
      }
      return primary.type === 'text'
        ? [`text:${primary.fontSize}|${primary.strokeColor}`]
        : [`${primary.backgroundColor}|${primary.strokeColor}|${primary.strokeStyle}`]
    }
  }
}

/** The kinds of thing selected, as a person counts them (a box with its lines is a box). */
export function selectedKinds(
  selected: readonly ExcalidrawElement[],
  elements: readonly ExcalidrawElement[]
): string[] {
  return [...new Set(unitsOf(elements, selected).map((unit) => kindKey(unit.primary)))]
}

/** Whether a key applies to the selection, for disabling its button. */
export function canSelectSame(
  key: SameKey,
  selected: readonly ExcalidrawElement[],
  elements: readonly ExcalidrawElement[],
  style: FigureStyle
): boolean {
  return unitsOf(elements, selected).some((unit) => valuesOf(unit, key, elements, style).length > 0)
}

/**
 * Every unit in the scene that matches the selection on `key` (the selection included): the
 * same kind of thing with the same fill, line, badge, text size or look.
 */
export function selectSame(
  key: SameKey,
  selected: readonly ExcalidrawElement[],
  elements: readonly ExcalidrawElement[],
  style: FigureStyle
): {
  selectedElementIds: Record<string, true>
  selectedGroupIds: Record<string, true>
  count: number
} {
  const probes = unitsOf(elements, selected)
  const wanted = new Map<string, Set<string>>()
  for (const probe of probes) {
    const kind = key === 'text' ? '*' : kindKey(probe.primary)
    const values = wanted.get(kind) ?? new Set<string>()
    for (const value of valuesOf(probe, key, elements, style)) {
      values.add(value)
    }
    wanted.set(kind, values)
  }
  const matches = unitsOf(elements, elements).filter((unit) => {
    const values = wanted.get(key === 'text' ? '*' : kindKey(unit.primary))
    return Boolean(values?.size) && valuesOf(unit, key, elements, style).some((v) => values?.has(v))
  })
  return {
    selectedElementIds: Object.fromEntries(
      matches.flatMap((unit) => unit.ids).map((id) => [id, true] as const)
    ),
    selectedGroupIds: Object.fromEntries(
      matches.filter((unit) => unit.group).map((unit) => [unit.key, true] as const)
    ),
    count: matches.length
  }
}

/** Selects what matches the selection on `key` and says how many, like Figma's toast. */
export function runSelectSame(
  api: ExcalidrawImperativeAPI,
  key: SameKey,
  style: FigureStyle
): number {
  const elements = api.getSceneElements()
  const ids = api.getAppState().selectedElementIds
  const selected = elements.filter((element) => ids[element.id])
  if (!selected.length) {
    return 0
  }
  const next = selectSame(key, selected, elements, style)
  api.updateScene({
    appState: {
      selectedElementIds: next.selectedElementIds,
      selectedGroupIds: next.selectedGroupIds,
      editingGroupId: null
    },
    captureUpdate: CaptureUpdateAction.NEVER
  })
  api.setToast({ message: `${next.count} selected`, duration: 1400, closable: false })
  return next.count
}
