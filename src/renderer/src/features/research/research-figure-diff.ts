import type { FigureElement } from '../../../../research-harness/research-figures-model.mjs'

/** What a write did to a figure, by element id. */
export type FigureElementDiff = { added: string[]; changed: string[]; removed: string[] }

// Why: these move on every write (or on Excalidraw's own re-measure) without the drawing changing.
const VOLATILE_KEYS = new Set(['version', 'versionNonce', 'updated', 'seed', 'index'])
// Why: Excalidraw re-measures text after fonts load, so a label's box moves by itself.
const TEXT_MEASURED_KEYS = new Set(['width', 'height', 'baseline'])

function live(elements: readonly FigureElement[]): Map<string, FigureElement> {
  return new Map(
    elements.filter((element) => !element.isDeleted).map((element) => [element.id, element])
  )
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'number') {
    return Math.round(value * 100) / 100
  }
  if (Array.isArray(value)) {
    return value.map(normalizeValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeValue(Reflect.get(value, key))])
    )
  }
  return value
}

function comparedKeys(element: FigureElement): string[] {
  return Object.keys(element).filter(
    (key) =>
      !VOLATILE_KEYS.has(key) &&
      key !== 'boundElements' &&
      !(element.type === 'text' && TEXT_MEASURED_KEYS.has(key))
  )
}

function boundIds(element: FigureElement | undefined): string[] {
  return (element?.boundElements ?? []).map((entry) => entry.id).sort()
}

function valueKey(element: FigureElement, key: string): string {
  return JSON.stringify(normalizeValue(element[key]) ?? null)
}

/** The properties that differ between two versions of one element, ignoring write noise. */
export function changedFigureKeys(before: FigureElement, after: FigureElement): string[] {
  const keys = new Set([...comparedKeys(before), ...comparedKeys(after)])
  const changed = [...keys].filter((key) => valueKey(before, key) !== valueKey(after, key))
  if (boundIds(before).join() !== boundIds(after).join()) {
    changed.push('boundElements')
  }
  return changed
}

export function sameFigureElement(a: FigureElement, b: FigureElement): boolean {
  return changedFigureKeys(a, b).length === 0
}

/** Added, changed and removed ids from one version of a scene to the next. */
export function diffFigureElements(
  before: readonly FigureElement[],
  after: readonly FigureElement[]
): FigureElementDiff {
  const previous = live(before)
  const next = live(after)
  const added: string[] = []
  const changed: string[] = []
  for (const [id, element] of next) {
    const old = previous.get(id)
    if (!old) {
      added.push(id)
    } else if (!sameFigureElement(old, element)) {
      changed.push(id)
    }
  }
  const removed = [...previous.keys()].filter((id) => !next.has(id))
  return { added, changed, removed }
}

export function figureDiffCount(diff: FigureElementDiff): number {
  return diff.added.length + diff.changed.length + diff.removed.length
}

/** "18 added · 4 changed · 3 removed", leaving out the zeros. */
export function figureDiffText(diff: FigureElementDiff): string {
  const parts = [
    diff.added.length ? `${diff.added.length} added` : '',
    diff.changed.length ? `${diff.changed.length} changed` : '',
    diff.removed.length ? `${diff.removed.length} removed` : ''
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'no changes'
}

/** A short human name for an element: its text, its box's label, its group's label, or its id. */
export function figureElementLabel(
  element: FigureElement,
  elements: readonly FigureElement[]
): string {
  const text = (value: unknown): string =>
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
  if (element.type === 'text' && text(element.text)) {
    return text(element.text)
  }
  const bound = elements.find(
    (entry) => entry.type === 'text' && entry.containerId === element.id && !entry.isDeleted
  )
  if (bound && text(bound.text)) {
    return text(bound.text)
  }
  const group = Array.isArray(element.groupIds) ? element.groupIds[0] : undefined
  // Why every line: the kit writes a multi-line label as one text element per line.
  const lines =
    typeof group === 'string'
      ? elements
          .filter(
            (entry) =>
              entry.type === 'text' &&
              !entry.isDeleted &&
              Array.isArray(entry.groupIds) &&
              entry.groupIds.includes(group) &&
              text(entry.text)
          )
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((entry) => text(entry.text))
      : []
  return lines.join(' ') || text(element.name) || element.id
}
