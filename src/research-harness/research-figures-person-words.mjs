// The person's hand edits in plain words, for the agent (figures run, check, preview, the prompt)
// and for the person (the Figures page): "'Encoder' (enc): moved 12 right; label 'z' → 'z_t'".
import { parsePersonEdits } from './research-figures-person-edits.mjs'

const round = (value) => Math.round(Number(value) * 10) / 10

function quoted(value) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return `'${text.length > 40 ? `${text.slice(0, 39)}…` : text}'`
}

function moveWords(set) {
  const parts = []
  const dx = set.x ? round(set.x.to - set.x.from) : 0
  const dy = set.y ? round(set.y.to - set.y.from) : 0
  if (dx) {
    parts.push(`${Math.abs(dx)} ${dx > 0 ? 'right' : 'left'}`)
  }
  if (dy) {
    parts.push(`${Math.abs(dy)} ${dy > 0 ? 'down' : 'up'}`)
  }
  return parts.length ? [`moved ${parts.join(' and ')}`] : []
}

function sizeWords(set) {
  if (!set.width && !set.height) {
    return []
  }
  const width = set.width ? round(set.width.to) : null
  const height = set.height ? round(set.height.to) : null
  if (width !== null && height !== null) {
    return [`resized to ${width} × ${height}`]
  }
  return width !== null
    ? [`width ${round(set.width.from)} → ${width}`]
    : [`height ${round(set.height.from)} → ${height}`]
}

const STYLE_NAMES = {
  strokeColor: 'line colour',
  backgroundColor: 'fill',
  fillStyle: 'fill style',
  strokeWidth: 'line width',
  strokeStyle: 'line style',
  roughness: 'roughness',
  opacity: 'opacity',
  fontSize: 'text size',
  fontFamily: 'font',
  textAlign: 'text alignment',
  verticalAlign: 'vertical alignment',
  roundness: 'corners',
  startArrowhead: 'start arrowhead',
  endArrowhead: 'end arrowhead'
}

function valueText(value) {
  if (value === null || value === undefined) {
    return 'none'
  }
  if (typeof value === 'object') {
    return value.type === 3 || value.type === 2 ? 'round' : JSON.stringify(value)
  }
  return typeof value === 'number' ? String(round(value)) : String(value)
}

/** One edit's changes in a few words each; an arrow that only follows its box says nothing. */
export function personEditWords(entry) {
  if (entry.added) {
    const element = entry.added.element ?? {}
    const what = element.type === 'text' ? `text ${quoted(element.text)}` : `a ${element.type}`
    return [`added ${what}`]
  }
  if (entry.removed) {
    return ['removed it']
  }
  const set = entry.set ?? {}
  const words = [...moveWords(set), ...sizeWords(set)]
  if (set.angle) {
    words.push('rotated it')
  }
  if (set.path && !set.path.follows) {
    words.push('re-routed it')
  }
  if (set.text) {
    words.push(`label ${quoted(set.text.from?.text)} → ${quoted(set.text.to?.text)}`)
  }
  for (const [prop, name] of Object.entries(STYLE_NAMES)) {
    if (set[prop]) {
      words.push(`${name} ${valueText(set[prop].from)} → ${valueText(set[prop].to)}`)
    }
  }
  if (set.locked) {
    words.push(set.locked.to ? 'locked it' : 'unlocked it')
  }
  return words
}

/** The edits that say something (an arrow that only follows a moved box is left out). */
export function visiblePersonEdits(ledger) {
  return parsePersonEdits(ledger).edits.filter((entry) => personEditWords(entry).length)
}

export function personEditLine(entry) {
  return `${quoted(entry.label ?? entry.id)} (${entry.id}): ${personEditWords(entry).join('; ')}`
}

function overrodeLine(item) {
  if (item.prop === 'element') {
    return `${quoted(item.label)} (${item.id}): the person added it; their version is back`
  }
  if (item.prop === 'canvas') {
    return `${quoted(item.label)} (${item.id}): you changed it (${item.agent}) while the person was changing it (${item.person}); their version is kept`
  }
  const show = (value) =>
    item.prop === 'text' ? quoted(value) : item.prop === 'path' ? 'another path' : valueText(value)
  return `${quoted(item.label)} (${item.id}) ${item.prop}: your run set ${show(item.agent)}, the person's ${show(item.person)} is kept`
}

/**
 * What the agent reads: each edit the person made by hand (kept over the script), the ones whose
 * element is gone, and what the last run changed that the person had set.
 */
export function personEditReport(ledger, { gone = [], overrode = [] } = {}) {
  const goneIds = new Set(gone.map((item) => item.id))
  const visible = visiblePersonEdits(ledger)
  const kept = visible.filter((entry) => !goneIds.has(entry.id)).map(personEditLine)
  return {
    count: visible.length,
    kept,
    gone: visible.filter((entry) => goneIds.has(entry.id)).map(personEditLine),
    overrode: overrode.filter((item) => !goneIds.has(item.id)).map(overrodeLine)
  }
}

/** The report as lines under one heading, or none when the person edited nothing. */
export function personEditLines(report, slug) {
  if (!report.kept.length && !report.gone.length && !report.overrode.length) {
    return []
  }
  const release = `figures edits --figure ${slug} --release <id>`
  return [
    ...(report.kept.length
      ? [
          `The person edited this figure by hand; Aster keeps these edits over every script run (build on them, never undo them):`,
          ...report.kept.map((line) => `  ${line}`)
        ]
      : []),
    ...(report.overrode.length
      ? [
          'Your last run changed what the person had set; their version was kept:',
          ...report.overrode.map((line) => `  ${line}`)
        ]
      : []),
    ...(report.gone.length
      ? [
          'These edits no longer apply because the element is gone (tell the person, or draw it again with the same id):',
          ...report.gone.map((line) => `  ${line}`)
        ]
      : []),
    `To change something the person edited, ask them first; then \`${release}\` lets your script set it again.`
  ]
}
