import type { FigureElement } from '../../../../research-harness/research-figures-model.mjs'
import { changedFigureKeys, figureElementLabel, sameFigureElement } from './research-figure-diff'
import { attachedTo } from './research-figure-selection-items'

/** One element both sides changed in ways that cannot both be kept. */
export type FigureMergeConflict = {
  id: string
  label: string
  /** Null when the element is new on both sides. */
  base: FigureElement | null
  /** Null when that side deleted the element. */
  mine: FigureElement | null
  agent: FigureElement | null
  /**
   * What the human changed alongside it in the same group (a box's label lines) or attached to it
   * (badges, arrow labels), with the agent's version, so picking the agent's keeps them together.
   */
  companions: { id: string; agent: FigureElement | null }[]
}

export type FigureMergeResult = {
  /** The merged scene; a conflicting element keeps the human's version until reviewed. */
  elements: FigureElement[]
  conflicts: FigureMergeConflict[]
  /** How many of the agent's element changes were taken without asking. */
  fromAgent: number
  fromMine: number
}

type Side = 'none' | 'added' | 'removed' | 'changed'

function live(elements: readonly FigureElement[]): Map<string, FigureElement> {
  return new Map(
    elements.filter((element) => !element.isDeleted).map((element) => [element.id, element])
  )
}

function sideChange(base: FigureElement | undefined, next: FigureElement | undefined): Side {
  if (!base) {
    return next ? 'added' : 'none'
  }
  if (!next) {
    return 'removed'
  }
  return sameFigureElement(base, next) ? 'none' : 'changed'
}

/** Arrows bound on either side stay bound, unless one side unbound them on purpose. */
function mergedBindings(
  base: FigureElement,
  mine: FigureElement,
  agent: FigureElement
): FigureElement['boundElements'] {
  const ids = (element: FigureElement): Map<string, { id: string; type: string }> =>
    new Map((element.boundElements ?? []).map((entry) => [entry.id, entry]))
  const fromBase = ids(base)
  const fromMine = ids(mine)
  const fromAgent = ids(agent)
  const merged = new Map([...fromMine, ...fromAgent])
  for (const id of fromBase.keys()) {
    if (!fromMine.has(id) || !fromAgent.has(id)) {
      merged.delete(id)
    }
  }
  return merged.size ? [...merged.values()] : null
}

/** Both sides changed one element: keep both when they touched different properties. */
function mergeElement(
  base: FigureElement,
  mine: FigureElement,
  agent: FigureElement
): FigureElement | null {
  if (sameFigureElement(mine, agent)) {
    return agent
  }
  const fromMine = changedFigureKeys(base, mine).filter((key) => key !== 'boundElements')
  const fromAgent = new Set(changedFigureKeys(base, agent).filter((key) => key !== 'boundElements'))
  if (fromMine.some((key) => fromAgent.has(key))) {
    return null
  }
  const merged: FigureElement = { ...agent }
  for (const key of fromMine) {
    merged[key] = mine[key]
  }
  merged.boundElements = mergedBindings(base, mine, agent)
  return merged
}

function innermostGroup(element: FigureElement | undefined | null): string | null {
  const group: unknown = Array.isArray(element?.groupIds) ? element.groupIds[0] : null
  return typeof group === 'string' ? group : null
}

/** Elements only the human changed that belong with a conflicting one (same group, attached). */
function companionsOf(
  conflict: FigureMergeConflict,
  mine: ReadonlyMap<string, FigureElement>,
  base: ReadonlyMap<string, FigureElement>,
  agent: ReadonlyMap<string, FigureElement>
): FigureMergeConflict['companions'] {
  const group = innermostGroup(conflict.mine ?? conflict.agent ?? conflict.base)
  const ids = new Set([...mine.keys(), ...base.keys()])
  ids.delete(conflict.id)
  return [...ids].flatMap((id) => {
    const element = mine.get(id) ?? base.get(id)
    const belongs =
      element &&
      ((group !== null && innermostGroup(element) === group) || attachedTo(element) === conflict.id)
    const humanOnly =
      sideChange(base.get(id), mine.get(id)) !== 'none' &&
      sideChange(base.get(id), agent.get(id)) === 'none'
    return belongs && humanOnly ? [{ id, agent: agent.get(id) ?? null }] : []
  })
}

/**
 * Element-level three-way merge of a figure: `base` is the file both sides started from, `mine`
 * the canvas, `agent` what the agent wrote since. Changes to different elements (or to different
 * properties of one element) are combined; the rest are conflicts for a person to decide.
 */
export function mergeFigureElements(input: {
  base: readonly FigureElement[]
  mine: readonly FigureElement[]
  agent: readonly FigureElement[]
}): FigureMergeResult {
  const base = live(input.base)
  const mine = live(input.mine)
  const agent = live(input.agent)
  const chosen = new Map<string, FigureElement>()
  const conflicts: FigureMergeConflict[] = []
  let fromAgent = 0
  let fromMine = 0
  const ids = new Set([...agent.keys(), ...mine.keys(), ...base.keys()])
  for (const id of ids) {
    const b = base.get(id)
    const m = mine.get(id)
    const a = agent.get(id)
    const mineSide = sideChange(b, m)
    const agentSide = sideChange(b, a)
    if (mineSide === 'none' || agentSide === 'none') {
      const pick = mineSide === 'none' ? a : m
      if (pick) {
        chosen.set(id, pick)
      }
      fromAgent += agentSide !== 'none' && mineSide === 'none' ? 1 : 0
      fromMine += mineSide !== 'none' && agentSide === 'none' ? 1 : 0
      continue
    }
    if (mineSide === 'removed' && agentSide === 'removed') {
      continue
    }
    const merged =
      b && m && a ? mergeElement(b, m, a) : m && a && sameFigureElement(m, a) ? a : null
    if (merged) {
      chosen.set(id, merged)
      fromAgent += 1
      fromMine += 1
      continue
    }
    const label = figureElementLabel(
      m ?? a ?? b ?? { id, type: 'unknown', x: 0, y: 0, width: 0, height: 0 },
      [...input.mine, ...input.agent]
    )
    conflicts.push({
      id,
      label,
      base: b ?? null,
      mine: m ?? null,
      agent: a ?? null,
      companions: []
    })
    if (m) {
      chosen.set(id, m)
    }
  }
  for (const conflict of conflicts) {
    conflict.companions = companionsOf(conflict, mine, base, agent)
  }
  // Why the agent's order first: it rewrote the z-order on purpose; the human's new ones go on top.
  const order = [
    ...input.agent.map((element) => element.id),
    ...input.mine.map((element) => element.id)
  ]
  const elements: FigureElement[] = []
  for (const id of order) {
    const element = chosen.get(id)
    if (element) {
      elements.push(element)
      chosen.delete(id)
    }
  }
  return { elements, conflicts, fromAgent, fromMine }
}

/** Applies a person's per-element choices to a merge result. */
export function resolveFigureConflicts(
  elements: readonly FigureElement[],
  conflicts: readonly FigureMergeConflict[],
  choices: Readonly<Record<string, 'mine' | 'agent'>>
): FigureElement[] {
  const byId = new Map(conflicts.map((conflict) => [conflict.id, conflict]))
  const companions = new Map(
    conflicts.flatMap((conflict) =>
      choices[conflict.id] === 'agent'
        ? conflict.companions.map((companion): [string, FigureElement | null] => [
            companion.id,
            companion.agent
          ])
        : []
    )
  )
  const result: FigureElement[] = []
  const placed = new Set<string>()
  for (const element of elements) {
    const conflict = byId.get(element.id)
    const pick =
      conflict && choices[element.id] === 'agent'
        ? conflict.agent
        : companions.has(element.id)
          ? (companions.get(element.id) ?? null)
          : element
    placed.add(element.id)
    if (pick) {
      result.push(pick)
    }
  }
  for (const conflict of conflicts) {
    if (!placed.has(conflict.id) && choices[conflict.id] === 'agent' && conflict.agent) {
      result.push(conflict.agent)
    }
  }
  return result
}

const CHANGE_WORDS: Record<string, string> = {
  x: 'moved',
  y: 'moved',
  width: 'resized',
  height: 'resized',
  text: 'text',
  originalText: 'text',
  strokeColor: 'color',
  backgroundColor: 'color',
  fillStyle: 'color',
  strokeWidth: 'line',
  strokeStyle: 'line',
  points: 'shape',
  fontSize: 'text size'
}

/** What one side did to a conflicting element, in a few words: "moved, color", "deleted". */
export function describeFigureChange(
  base: FigureElement | null,
  side: FigureElement | null
): string {
  if (!side) {
    return 'deleted'
  }
  if (!base) {
    return 'added'
  }
  const words = new Set(
    changedFigureKeys(base, side)
      .filter((key) => key !== 'boundElements')
      .map((key) => CHANGE_WORDS[key] ?? key)
  )
  return words.size ? [...words].join(', ') : 'changed'
}
