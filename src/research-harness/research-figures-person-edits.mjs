// The person's hand edits to a figure, kept over the agent's script runs. Aster records what the
// person changed on its canvas (moves, sizes, labels, colours, locks, deletions, additions) in
// `<figures>/src/<slug>.edits.json`, beside the script; every script run re-applies them where the
// element still exists (the kit's save, or Aster itself when an older harness wrote the file), and
// the harness tells the agent what was kept. Pure functions: the app imports this file too.
import { followMovedElements } from './research-figures-person-follow.mjs'

export const PERSON_EDITS_VERSION = 1

const GEOMETRY = ['x', 'y', 'width', 'height', 'angle']
export const PERSON_STYLE_PROPS = [
  'strokeColor',
  'backgroundColor',
  'fillStyle',
  'strokeWidth',
  'strokeStyle',
  'roughness',
  'opacity',
  'fontSize',
  'fontFamily',
  'textAlign',
  'verticalAlign',
  'roundness',
  'startArrowhead',
  'endArrowhead'
]
/** Applied in this order: geometry first, so a label's new text measures in its new box. */
export const PERSON_EDIT_PROPS = [...GEOMETRY, 'path', ...PERSON_STYLE_PROPS, 'text', 'locked']
const LINEAR = new Set(['arrow', 'line'])
const FRAMES = new Set(['frame', 'magicframe'])
// Why a cap: a photo pasted by hand is kept with the edit; a huge one would bloat the file.
const MAX_FILE_CHARS = 2_000_000

export function emptyPersonEdits() {
  return { version: PERSON_EDITS_VERSION, edits: [] }
}

/** A ledger read from disk, or an empty one when it is missing or not one. */
export function parsePersonEdits(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.edits)) {
    return emptyPersonEdits()
  }
  const edits = value.edits.filter(
    (entry) => entry && typeof entry === 'object' && typeof entry.id === 'string'
  )
  return { version: PERSON_EDITS_VERSION, edits }
}

function normal(value) {
  if (typeof value === 'number') {
    return Math.round(value * 100) / 100
  }
  if (Array.isArray(value)) {
    return value.map(normal)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normal(value[key])])
    )
  }
  return value ?? null
}

const same = (a, b) => JSON.stringify(normal(a)) === JSON.stringify(normal(b))

/** One tracked property's value; `path` and `text` hold the fields that change together. */
export function readPersonProp(element, prop) {
  if (prop === 'path') {
    return {
      x: element.x,
      y: element.y,
      points: element.points ?? [],
      startBinding: element.startBinding ?? null,
      endBinding: element.endBinding ?? null
    }
  }
  if (prop === 'text') {
    return { text: element.text ?? '', width: element.width, height: element.height }
  }
  return element[prop] ?? null
}

/** What decides whether two values are the same edit: a label's words, a path's points and ends. */
export function comparablePersonValue(prop, value) {
  if (prop === 'text') {
    return value?.text ?? ''
  }
  if (prop === 'path') {
    return {
      x: value?.x,
      y: value?.y,
      points: value?.points ?? [],
      start: value?.startBinding?.elementId ?? null,
      end: value?.endBinding?.elementId ?? null
    }
  }
  return value
}

const sameProp = (prop, a, b) =>
  same(comparablePersonValue(prop, a), comparablePersonValue(prop, b))

function writePersonProp(element, prop, value) {
  if (prop === 'path') {
    element.x = value.x
    element.y = value.y
    element.points = value.points.map((point) => [...point])
    element.startBinding = value.startBinding
    element.endBinding = value.endBinding
    const xs = element.points.map((point) => point[0])
    const ys = element.points.map((point) => point[1])
    element.width = xs.length ? Math.max(...xs) - Math.min(...xs) : 0
    element.height = ys.length ? Math.max(...ys) - Math.min(...ys) : 0
    return
  }
  if (prop === 'text') {
    element.text = value.text
    element.originalText = value.text
    // Why: Aster measured the person's text; a box with a fixed width keeps the one it has.
    if (element.autoResize !== false && typeof value.width === 'number') {
      element.width = value.width
    }
    if (typeof value.height === 'number') {
      element.height = value.height
    }
    return
  }
  element[prop] = value
}

/** The properties a person's edit can set on an element of this kind. */
export function personPropsFor(element) {
  if (FRAMES.has(element.type)) {
    return []
  }
  if (LINEAR.has(element.type)) {
    return ['path', ...PERSON_STYLE_PROPS, 'locked']
  }
  if (element.type === 'text') {
    // Why: a label inside a box sits where its box puts it, and text measures its own size.
    const geometry = element.containerId
      ? []
      : ['x', 'y', 'angle', ...(element.autoResize === false ? ['width'] : [])]
    return [...geometry, ...PERSON_STYLE_PROPS, 'text', 'locked']
  }
  return [...GEOMETRY, ...PERSON_STYLE_PROPS, 'locked']
}

const live = (elements) =>
  new Map(
    (elements ?? [])
      .filter((element) => element && !element.isDeleted)
      .map((element) => [element.id, element])
  )

function pageLook(elements) {
  const page = (elements ?? []).find((element) => element?.id === 'figure-page')
  const look = page?.customData?.asterPage ?? {}
  return JSON.stringify([look.style ?? null, look.accent ?? null, look.look ?? null])
}

function moved(before, after) {
  return ['x', 'y', 'width', 'height'].some((key) => !same(before[key], after[key]))
}

/** A short name for an element: its text, its box's label, its kit group's lines, or its id. */
export function personEditLabel(element, elements) {
  const words = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')
  if (element.type === 'text' && words(element.text)) {
    return words(element.text).slice(0, 40)
  }
  const bound = (elements ?? []).find(
    (entry) => entry?.type === 'text' && entry.containerId === element.id && !entry.isDeleted
  )
  if (bound && words(bound.text)) {
    return words(bound.text).slice(0, 40)
  }
  const group = Array.isArray(element.groupIds) ? element.groupIds[0] : null
  const lines = group
    ? (elements ?? [])
        .filter(
          (entry) =>
            entry?.type === 'text' &&
            !entry.isDeleted &&
            entry.groupIds?.includes(group) &&
            words(entry.text)
        )
        .map((entry) => words(entry.text))
    : []
  return (lines.join(' ') || words(element.name) || element.id).slice(0, 40)
}

function copied(value) {
  return JSON.parse(JSON.stringify(value))
}

function addedRecord(element, files) {
  const file = element.fileId ? files?.[element.fileId] : null
  const fits = file && JSON.stringify(file).length <= MAX_FILE_CHARS
  return {
    element: copied(element),
    ...(file ? (fits ? { file: copied(file) } : { fileTooLarge: true }) : {})
  }
}

/**
 * Adds what the person changed from `before` to `after` (one save of the editor) to `ledger`.
 * `touched` limits it to the elements whose version moved on the canvas (null: every element),
 * so what Excalidraw rewrites on its own when it loads a file is never taken for an edit.
 */
export function recordPersonEdits(
  ledger,
  { before, after, files = {}, touched = null, at = new Date().toISOString() }
) {
  const next = copied(parsePersonEdits(ledger))
  const was = live(before)
  const now = live(after)
  const all = [...(after ?? []), ...(before ?? [])]
  // Why: a new colour preset restyles every element; the page keeps the preset for the kit.
  const restyled = pageLook(before) !== pageLook(after)
  const ids = touched ? [...new Set(touched)] : [...new Set([...was.keys(), ...now.keys()])]
  const movedIds = new Set(
    ids.filter((id) => was.has(id) && now.has(id) && moved(was.get(id), now.get(id)))
  )
  const entryFor = (id, element) => {
    let entry = next.edits.find((candidate) => candidate.id === id)
    if (!entry) {
      entry = { id, label: personEditLabel(element, all), at }
      next.edits.push(entry)
    }
    entry.at = at
    entry.label = personEditLabel(element, all)
    return entry
  }
  const drop = (id) => {
    next.edits = next.edits.filter((entry) => entry.id !== id)
  }
  for (const id of ids) {
    const b = was.get(id)
    const a = now.get(id)
    const element = a ?? b
    if (!element || FRAMES.has(element.type)) {
      continue
    }
    const existing = next.edits.find((entry) => entry.id === id)
    if (!b && a) {
      const entry = entryFor(id, a)
      delete entry.removed
      delete entry.set
      entry.added = addedRecord(a, files)
      continue
    }
    if (b && !a) {
      if (existing?.added) {
        drop(id)
        continue
      }
      const entry = entryFor(id, b)
      delete entry.set
      entry.removed = true
      continue
    }
    if (existing?.added) {
      existing.added = addedRecord(a, files)
      existing.at = at
      continue
    }
    const changes = []
    for (const prop of personPropsFor(a)) {
      if (restyled && PERSON_STYLE_PROPS.includes(prop)) {
        continue
      }
      const from = readPersonProp(b, prop)
      const to = readPersonProp(a, prop)
      if (!sameProp(prop, from, to)) {
        changes.push({ prop, from, to })
      }
    }
    if (!changes.length) {
      continue
    }
    const entry = entryFor(id, a)
    delete entry.removed
    entry.set ??= {}
    for (const { prop, from, to } of changes) {
      const origin = entry.set[prop] ? entry.set[prop].from : from
      if (sameProp(prop, origin, to)) {
        delete entry.set[prop]
        continue
      }
      // Why: an arrow Excalidraw re-routed because its box moved follows the box on a rerun.
      const follows =
        prop === 'path' &&
        [a.startBinding?.elementId, a.endBinding?.elementId].some((end) => movedIds.has(end))
      entry.set[prop] = { from: origin, to, ...(follows ? { follows: true } : {}) }
    }
    if (!Object.keys(entry.set).length) {
      drop(id)
    }
  }
  return next
}

/**
 * Drops what the person undid without editing it again: a version they restored, a variant they
 * adopted, or the agent's side they picked in a merge review leaves the canvas without their value.
 */
export function prunePersonEdits(ledger, elements) {
  const next = copied(parsePersonEdits(ledger))
  const now = live(elements)
  next.edits = next.edits.filter((entry) => {
    const element = now.get(entry.id)
    if (entry.added) {
      return Boolean(element)
    }
    if (entry.removed) {
      return !element
    }
    if (!element) {
      return true
    }
    for (const [prop, edit] of Object.entries(entry.set ?? {})) {
      if (!sameProp(prop, readPersonProp(element, prop), edit.to)) {
        delete entry.set[prop]
      }
    }
    return Object.keys(entry.set ?? {}).length > 0
  })
  return next
}

/** Drops edits by id (`enc`) or one property of one (`enc.x`); ids that match nothing are returned. */
export function releasePersonEdits(ledger, targets) {
  const next = copied(parsePersonEdits(ledger))
  const unknown = []
  for (const target of targets) {
    const [id, prop] = String(target).split('.')
    const entry = next.edits.find((candidate) => candidate.id === id)
    if (!entry || (prop && !entry.set?.[prop])) {
      unknown.push(target)
      continue
    }
    if (prop) {
      delete entry.set[prop]
    }
    if (!prop || !Object.keys(entry.set ?? {}).length) {
      next.edits = next.edits.filter((candidate) => candidate !== entry)
    }
  }
  return { ledger: next, unknown }
}

function bump(element, random) {
  element.version = (Number(element.version) || 1) + 1
  element.versionNonce = Math.floor(random() * 2 ** 31)
  element.updated = Date.now()
}

function boxOf(element) {
  return { x: element.x, y: element.y, width: element.width, height: element.height }
}

function removeElement(elements, id) {
  const gone = new Set([id])
  for (const element of elements) {
    if (element.type === 'text' && element.containerId === id) {
      gone.add(element.id)
    }
  }
  const kept = elements.filter((element) => !gone.has(element.id))
  for (const element of kept) {
    if (element.boundElements) {
      element.boundElements = element.boundElements.filter((bound) => !gone.has(bound.id))
    }
    for (const side of ['startBinding', 'endBinding']) {
      if (element[side] && gone.has(element[side].elementId)) {
        element[side] = null
      }
    }
  }
  elements.length = 0
  elements.push(...kept)
}

const VOLATILE = new Set(['version', 'versionNonce', 'updated', 'seed', 'index'])

function sameElement(a, b) {
  const strip = (element) =>
    Object.fromEntries(Object.entries(element).filter(([key]) => !VOLATILE.has(key)))
  return same(strip(a), strip(b))
}

/**
 * Puts the person's edits back on a scene an agent just wrote, in place: an edit wins wherever its
 * element still exists, so a script run never undoes what the person did by hand. Returns whether
 * the scene changed and a report: what is kept, what this run had changed that the person had set
 * (`overrode`, the person's value kept), and the edits whose element no longer exists (`gone`).
 */
export function applyPersonEdits(scene, ledger, { random = Math.random } = {}) {
  const report = { kept: [], overrode: [], gone: [], restored: [], removed: [] }
  const edits = parsePersonEdits(ledger).edits
  if (!edits.length || !Array.isArray(scene?.elements)) {
    return { changed: false, report }
  }
  const elements = scene.elements
  const find = (id) => elements.find((element) => element.id === id && !element.isDeleted)
  const movedBoxes = new Map()
  const pathsSet = new Set()
  let changed = false
  for (const entry of edits) {
    const element = find(entry.id)
    const label = entry.label ?? entry.id
    if (entry.added) {
      if (!element) {
        elements.push(copied(entry.added.element))
        if (entry.added.file && entry.added.element.fileId) {
          scene.files ??= {}
          scene.files[entry.added.element.fileId] = copied(entry.added.file)
        }
        report.restored.push({ id: entry.id, label })
        changed = true
      } else if (!sameElement(element, entry.added.element)) {
        elements[elements.indexOf(element)] = copied(entry.added.element)
        report.overrode.push({ id: entry.id, label, prop: 'element', agent: null, person: null })
        changed = true
      }
      report.kept.push({ id: entry.id, label })
      continue
    }
    if (entry.removed) {
      if (element) {
        removeElement(elements, entry.id)
        report.removed.push({ id: entry.id, label })
        changed = true
      }
      report.kept.push({ id: entry.id, label })
      continue
    }
    if (!element) {
      report.gone.push({ id: entry.id, label })
      continue
    }
    const before = boxOf(element)
    let touched = false
    for (const prop of PERSON_EDIT_PROPS) {
      const edit = entry.set?.[prop]
      if (!edit) {
        continue
      }
      const current = readPersonProp(element, prop)
      if (sameProp(prop, current, edit.to)) {
        continue
      }
      const regenerated = sameProp(prop, current, edit.from)
      if (prop === 'path' && edit.follows && !regenerated) {
        continue
      }
      if (!regenerated) {
        report.overrode.push({
          id: entry.id,
          label,
          prop,
          agent: comparablePersonValue(prop, current),
          person: comparablePersonValue(prop, edit.to)
        })
      }
      writePersonProp(element, prop, copied(edit.to))
      if (prop === 'path') {
        pathsSet.add(element.id)
      }
      touched = true
    }
    if (touched) {
      bump(element, random)
      changed = true
      if (moved(before, element)) {
        movedBoxes.set(element.id, { from: before, to: boxOf(element) })
      }
    }
    report.kept.push({ id: entry.id, label })
  }
  for (const id of followMovedElements(elements, movedBoxes, { skip: pathsSet })) {
    bump(find(id), random)
  }
  return { changed, report }
}
