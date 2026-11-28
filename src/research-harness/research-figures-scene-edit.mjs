// `figures edit --set ID.PROP=VALUE`: a few direct changes to a scene without rerunning its
// script. A move carries the box's label and bound arrow ends along; a label is measured again in
// its font; a property the person set by hand is refused until they agree (figures edits
// --release). Pure: the CLI reads and writes the file.
import { followMovedElements } from './research-figures-person-follow.mjs'
import { measureText } from './research-figures-text.mjs'

const NUMBERS = new Set([
  'x',
  'y',
  'dx',
  'dy',
  'width',
  'height',
  'angle',
  'strokeWidth',
  'opacity',
  'fontSize',
  'roughness',
  'fontFamily'
])
const CHOICES = {
  fillStyle: ['solid', 'hachure', 'cross-hatch', 'zigzag'],
  strokeStyle: ['solid', 'dashed', 'dotted'],
  textAlign: ['left', 'center', 'right'],
  verticalAlign: ['top', 'middle', 'bottom']
}
const COLOURS = new Set(['strokeColor', 'backgroundColor'])
export const SCENE_EDIT_PROPS = [...NUMBERS, ...Object.keys(CHOICES), ...COLOURS, 'text', 'locked']

/** `enc.x=120` → { id: 'enc', prop: 'x', value: 120 }; throws on a malformed one. */
export function parseSceneEdit(spec) {
  const match = /^([^=]+)\.([A-Za-z]+)=(.*)$/s.exec(String(spec))
  if (!match) {
    throw new Error(`--set takes ID.PROP=VALUE, e.g. enc.x=120 or lbl.text=z_t, not "${spec}"`)
  }
  const [, id, prop, raw] = match
  if (!SCENE_EDIT_PROPS.includes(prop)) {
    throw new Error(
      `${prop} is not a property figures edit sets; it sets ${SCENE_EDIT_PROPS.join(', ')}`
    )
  }
  if (NUMBERS.has(prop)) {
    const value = Number(raw)
    if (!Number.isFinite(value)) {
      throw new Error(`${id}.${prop} needs a number, not "${raw}"`)
    }
    return { id, prop, value }
  }
  if (CHOICES[prop] && !CHOICES[prop].includes(raw)) {
    throw new Error(`${id}.${prop} is one of ${CHOICES[prop].join(', ')}`)
  }
  if (COLOURS.has(prop) && raw !== 'transparent' && !/^#[0-9a-f]{3,8}$/i.test(raw)) {
    throw new Error(`${id}.${prop} takes #hex or transparent, not "${raw}"`)
  }
  if (prop === 'locked') {
    if (raw !== 'true' && raw !== 'false') {
      throw new Error(`${id}.locked is true or false`)
    }
    return { id, prop, value: raw === 'true' }
  }
  return { id, prop, value: prop === 'text' ? raw.replaceAll('\\n', '\n') : raw }
}

/** The ledger property a scene edit would touch, to refuse what the person set by hand. */
function personProp(element, prop) {
  if (prop === 'dx') {
    return 'x'
  }
  if (prop === 'dy') {
    return 'y'
  }
  return ['arrow', 'line'].includes(element.type) && ['x', 'y'].includes(prop) ? 'path' : prop
}

function remeasure(text) {
  const size = measureText(text.text, text.fontSize ?? 16, text.fontFamily ?? 9)
  if (text.autoResize !== false) {
    text.width = Math.round(size.width * 100) / 100
  }
  text.height = Math.round(size.height * 100) / 100
}

/**
 * Applies the edits to `scene` in place. `personSet` maps an id to the properties the person
 * set by hand; those are refused. Returns what changed, and the refusals and misses as errors.
 */
export function editFigureScene(
  scene,
  edits,
  { personSet = new Map(), random = Math.random } = {}
) {
  const elements = scene.elements ?? []
  const find = (id) => elements.find((element) => element.id === id && !element.isDeleted)
  const changed = new Set()
  const errors = []
  const moved = new Map()
  for (const edit of edits) {
    let element = find(edit.id)
    if (!element) {
      errors.push(`No element ${edit.id} (figures show lists the ids)`)
      continue
    }
    if (edit.prop === 'text' && element.type !== 'text') {
      const bound = (element.boundElements ?? []).find((entry) => entry.type === 'text')
      element = bound ? find(bound.id) : null
      if (!element) {
        errors.push(
          `${edit.id} has no label of its own; set the text on its text element (figures show)`
        )
        continue
      }
    }
    const owned = personSet.get(element.id)
    const prop = personProp(element, edit.prop)
    if (owned?.has(prop)) {
      errors.push(
        `${element.id}.${edit.prop}: the person set this by hand. Ask them first; if they agree, figures edits --release ${element.id}.${prop}, then edit it`
      )
      continue
    }
    const before = { x: element.x, y: element.y, width: element.width, height: element.height }
    if (edit.prop === 'dx' || edit.prop === 'dy') {
      element[edit.prop === 'dx' ? 'x' : 'y'] += edit.value
    } else if (edit.prop === 'text') {
      element.text = edit.value
      element.originalText = edit.value
      remeasure(element)
    } else {
      element[edit.prop] = edit.value
      if (element.type === 'text' && (edit.prop === 'fontSize' || edit.prop === 'fontFamily')) {
        remeasure(element)
      }
    }
    if (['x', 'y', 'width', 'height'].some((key) => before[key] !== element[key])) {
      const from = moved.get(element.id)?.from ?? before
      moved.set(element.id, {
        from,
        to: { x: element.x, y: element.y, width: element.width, height: element.height }
      })
    }
    changed.add(element.id)
  }
  for (const id of followMovedElements(elements, moved)) {
    changed.add(id)
  }
  for (const id of changed) {
    const element = find(id)
    element.version = (Number(element.version) || 1) + 1
    element.versionNonce = Math.floor(random() * 2 ** 31)
    element.updated = Date.now()
  }
  return { changed: [...changed], errors }
}
