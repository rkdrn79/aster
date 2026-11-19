import { newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { PAGE_FRAME_ID } from '../../../../research-harness/research-figures-model.mjs'
import { attachmentOf, readAsterMath } from './research-figure-element-meta'
import { isPanelElement } from './research-figure-panel-fit'

export type LayerKind = 'box' | 'panel' | 'arrow' | 'text' | 'picture' | 'math' | 'other'
export type LayerPart = { id: string; name: string; kind: LayerKind; editingGroupId: string }

/**
 * One row of the layers panel: a thing a person picks (a box with its label, math and badge, an
 * arrow, a panel with its title), named by what it says, topmost first.
 */
export type LayerRow = {
  key: string
  ids: string[]
  group: boolean
  kind: LayerKind
  name: string
  fill: string | null
  locked: boolean
  hidden: boolean
  /** A box's label lines and math, reachable in one click. */
  parts: LayerPart[]
}

const SHAPES = new Set(['rectangle', 'ellipse', 'diamond'])

/** The mark a hidden element keeps: what it looked like before, so showing it restores that. */
export function hiddenMark(
  element: ExcalidrawElement
): { opacity: number; locked: boolean } | null {
  const mark: unknown = element.customData?.asterHidden
  if (typeof mark !== 'object' || mark === null) {
    return null
  }
  const opacity: unknown = Reflect.get(mark, 'opacity')
  const locked: unknown = Reflect.get(mark, 'locked')
  return {
    opacity: typeof opacity === 'number' ? opacity : 100,
    locked: locked === true
  }
}

function kindOf(element: ExcalidrawElement): LayerKind {
  if (isPanelElement(element)) {
    return 'panel'
  }
  if (SHAPES.has(element.type)) {
    return 'box'
  }
  if (element.type === 'arrow' || element.type === 'line') {
    return 'arrow'
  }
  if (element.type === 'text') {
    return 'text'
  }
  if (element.type === 'image') {
    return readAsterMath(element) ? 'math' : 'picture'
  }
  return 'other'
}

const RANK: Record<LayerKind, number> = {
  panel: 3,
  box: 3,
  picture: 3,
  arrow: 2,
  math: 1,
  text: 1,
  other: 0
}

const GREEK: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  eta: 'η',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  phi: 'φ',
  psi: 'ψ',
  omega: 'ω',
  Sigma: 'Σ',
  Phi: 'Φ',
  Omega: 'Ω'
}

/** TeX as a row reads it: Greek letters as letters, font commands and braces dropped. */
export function texForRow(tex: string): string {
  return tex
    .replace(/\\(mathcal|mathbb|mathrm|mathbf|mathit|boldsymbol|bar|hat|tilde|text)\b/g, '')
    .replace(/\\([A-Za-z]+)/g, (_match, name: string) => GREEK[name] ?? name)
    .replace(/[{}]/g, '')
    .trim()
}

const words = (element: ExcalidrawElement): string =>
  element.type === 'text'
    ? element.text.replace(/\s+/g, ' ').trim()
    : texForRow(readAsterMath(element)?.tex ?? '')

/** What a group of lines and math says, read top to bottom, math after a dot. */
function spoken(parts: readonly ExcalidrawElement[]): string {
  const sorted = parts.toSorted((a, b) => a.y - b.y || a.x - b.x)
  const text = sorted.filter((part) => part.type === 'text').map(words)
  const math = sorted.filter((part) => part.type === 'image').map(words)
  return [text.join(' '), math.join(' ')].filter(Boolean).join(' · ')
}

/** Every thing on the figure as the layers panel lists it, topmost first. */
export function layerRows(elements: readonly ExcalidrawElement[]): LayerRow[] {
  const live = elements.filter(
    (element) => !element.isDeleted && element.id !== PAGE_FRAME_ID && element.type !== 'frame'
  )
  const byId = new Map(live.map((element) => [element.id, element]))
  const order = new Map(elements.map((element, index) => [element.id, index]))
  const units = new Map<string, ExcalidrawElement[]>()
  for (const element of live) {
    if (element.type === 'text' && element.containerId) {
      continue
    }
    const attachment = attachmentOf(element, byId)
    if (attachment && attachment.kind !== 'box-label' && attachment.kind !== 'title') {
      continue
    }
    const key = element.groupIds.at(-1) ?? element.id
    units.set(key, [...(units.get(key) ?? []), element])
  }
  const name = (id: string): string => {
    const element = byId.get(id)
    const key = element ? (element.groupIds.at(-1) ?? element.id) : id
    return rowName(units.get(key) ?? [], live) || (element ? kindOf(element) : id)
  }
  const rows = [...units.entries()].map(([key, members]): LayerRow & { z: number } => {
    const primary = members.toSorted(
      (a, b) => RANK[kindOf(b)] - RANK[kindOf(a)] || b.width * b.height - a.width * a.height
    )[0]
    const kind = kindOf(primary)
    const parts = members.filter((member) =>
      member.groupIds.some((group) => group !== key && group.endsWith('-label-group'))
    )
    const hidden = members.every((member) => hiddenMark(member) !== null)
    let label = rowName(members, live)
    if (kind === 'arrow' && !label && primary.type === 'arrow') {
      const from = primary.startBinding?.elementId
      const to = primary.endBinding?.elementId
      label = from && to ? `${name(from)} → ${name(to)}` : 'arrow'
    }
    return {
      key,
      ids: members.map((member) => member.id),
      group: members[0].groupIds.at(-1) === key,
      kind,
      name: (kind === 'panel' ? `${label || 'panel'} (panel)` : label) || kind,
      fill: SHAPES.has(primary.type) ? primary.backgroundColor : null,
      locked: members.every((member) => member.locked) && !hidden,
      hidden,
      parts: parts.map((part) => ({
        id: part.id,
        name: `${part.type === 'text' ? 'label' : 'math'}: ${words(part)}`,
        kind: kindOf(part),
        editingGroupId: part.groupIds[0] ?? key
      })),
      z: Math.max(...members.map((member) => order.get(member.id) ?? 0))
    }
  })
  return rows.toSorted((a, b) => b.z - a.z).map(({ z: _z, ...row }) => row)
}

/** A unit's name: its bound or grouped label and math, or an arrow's label. */
function rowName(
  members: readonly ExcalidrawElement[],
  live: readonly ExcalidrawElement[]
): string {
  const ids = new Set(members.map((member) => member.id))
  const bound = live.filter(
    (element) => element.type === 'text' && element.containerId && ids.has(element.containerId)
  )
  const said = members.filter(
    (member) => member.type === 'text' || (member.type === 'image' && readAsterMath(member))
  )
  const byId = new Map(live.map((element) => [element.id, element]))
  const arrowLabels = live.filter((element) => {
    const attachment = attachmentOf(element, byId)
    return attachment?.kind === 'arrow-label' && ids.has(attachment.to)
  })
  return spoken([...bound, ...said, ...arrowLabels])
}

/**
 * Hides (or shows) elements, PowerPoint's Selection Pane eye: a hidden thing is invisible and
 * takes no clicks (opacity 0, locked); showing it gives back the look and lock it had.
 */
export function withHidden(
  elements: readonly ExcalidrawElement[],
  ids: ReadonlySet<string>,
  hidden: boolean
): ExcalidrawElement[] {
  return elements.map((element) => {
    if (!ids.has(element.id)) {
      return element
    }
    const mark = hiddenMark(element)
    if (hidden && !mark) {
      return newElementWith(element, {
        opacity: 0,
        locked: true,
        customData: {
          ...element.customData,
          asterHidden: { opacity: element.opacity, locked: element.locked }
        }
      })
    }
    if (!hidden && mark) {
      const { asterHidden: _hidden, ...customData } = element.customData ?? {}
      return newElementWith(element, { opacity: mark.opacity, locked: mark.locked, customData })
    }
    return element
  })
}

/**
 * The scene with one row moved just above or below another in drawing order (a row higher in
 * the list draws on top); its elements keep their order among themselves.
 */
export function reorderLayer(
  elements: readonly ExcalidrawElement[],
  moving: readonly string[],
  target: readonly string[],
  place: 'above' | 'below'
): ExcalidrawElement[] {
  const moved = new Set(moving)
  const anchor = new Set(target)
  if (!moved.size || !anchor.size || target.some((id) => moved.has(id))) {
    return [...elements]
  }
  const block = elements.filter((element) => moved.has(element.id))
  const rest = elements.filter((element) => !moved.has(element.id))
  const indices = rest.flatMap((element, index) => (anchor.has(element.id) ? [index] : []))
  const at = place === 'above' ? Math.max(...indices) + 1 : Math.min(...indices)
  return [...rest.slice(0, at), ...block, ...rest.slice(at)]
}
