// `figures kit <names>` and `figures plot kit <names>`: every name resolves, whatever family it
// comes from (a kit topic or function, a template, colours, an aster_plot helper or plot kind),
// comma lists mixing them; an unknown name gets the closest names instead of a dead end.
import { colorsText } from './research-figures-kit-topics.mjs'
import { KIT_TOPICS, kitReferenceText } from './research-figures-kit-index.mjs'
import { KIT_REFERENCE } from './research-figures-kit-reference.mjs'
import { PLOT_API_INDEX } from './research-figures-plot-api.mjs'
import { PLOT_KINDS } from './research-figures-plot.mjs'
import { TEMPLATES, templateText } from './research-figures-templates.mjs'

/** Names agents guess for kit functions that go by another name. */
const ALIASES = {
  line: 'polyline',
  lines: 'polyline',
  curve: 'polyline',
  rect: 'box',
  rectangle: 'box',
  label: 'text',
  arrows: 'arrow',
  colours: 'colors'
}

/** Topics with their own page, named inside a comma list: where that page is. */
const PAGES = {
  data: 'data: Python data figures with aster_plot.py; `figures plot kit` (or `figures kit data`) prints its page',
  icons: 'icons: `figures kit icons` lists the icon names',
  templates: 'templates: `figures kit templates` lists the templates',
  library: "library: `figures kit library` lists the project's saved parts",
  illustrations: 'illustrations: `figures kit illustrations <words>` searches the vector pictures',
  examples:
    'examples: `figures kit examples` lists the worked scripts, `figures kit examples <name>` prints one'
}

/** aster_plot's entries from the plot index: { names, section, text }. */
export function plotEntries() {
  const out = []
  let section = ''
  for (const line of PLOT_API_INDEX.split('\n')) {
    const call = /^ {2}([\w.]+)\(/.exec(line)
    if (call) {
      const full = call[1]
      const short = full.replace(/^(ap\.|p\.)/, '')
      const names = new Set([full, short, short.replace(/^toy\./, ''), `ap.${short}`])
      out.push({ names: [...names], section, text: [line] })
    } else if (/^\S/.test(line) && line.endsWith(':')) {
      section = line.slice(0, -1)
    } else if (out.length && /^ {6}/.test(line)) {
      out.at(-1).text.push(line)
    }
  }
  return out
}

function sectionKey(section) {
  return section.split(/[\s,:]/)[0].toLowerCase()
}

/** The text one aster_plot name prints: a helper, a section ("results", "3d") or a kind. */
function plotText(name) {
  const entries = plotEntries()
  const exact = entries.filter((entry) => entry.names.includes(name))
  if (exact.length) {
    return exact.map((entry) => entry.text.join('\n')).join('\n')
  }
  const section = entries.filter((entry) => sectionKey(entry.section) === name.toLowerCase())
  if (section.length) {
    return [`${section[0].section}:`, ...section.map((entry) => entry.text.join('\n'))].join('\n')
  }
  if (Object.hasOwn(PLOT_KINDS, name)) {
    return `figures plot new --kind ${name}: ${PLOT_KINDS[name].label}`
  }
  // Why option values: an agent asks for toy.sharp-flat or sophia, which are names a helper takes.
  const value = name.replace(/^(ap\.)?toy\./, '')
  const mentions = new RegExp(
    `(^|[\\s(,'"])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s),'"=]|$)`
  )
  const holders =
    value.length > 2 ? entries.filter((entry) => mentions.test(entry.text.join(' '))) : []
  return holders.length ? holders.map((entry) => entry.text.join('\n')).join('\n') : null
}

function kitText(name) {
  const known = KIT_REFERENCE.some((entry) => entry.topic === name || entry.name === name)
  if (known) {
    return kitReferenceText(name)
  }
  // Why: perspective templates are listed as 'template nerf-rays'; agents ask for 'nerf-rays'.
  const scene = `template ${name}`
  return KIT_REFERENCE.some((entry) => entry.name === scene) ? kitReferenceText(scene) : null
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const kept = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = kept
    }
  }
  return row[b.length]
}

function everyName() {
  return [
    ...KIT_TOPICS,
    ...KIT_REFERENCE.map((entry) => entry.name),
    ...Object.keys(TEMPLATES),
    ...Object.keys(PLOT_KINDS),
    ...plotEntries().map((entry) => entry.names.at(-1)),
    'colors',
    'icons',
    'templates',
    'library',
    'illustrations',
    'examples'
  ]
}

function closest(name) {
  const scored = [...new Set(everyName())]
    .map((option) => [option, distance(name.toLowerCase(), option.toLowerCase())])
    .filter(([option, score]) => score <= Math.max(2, name.length / 3) || option.includes(name))
    .toSorted((a, b) => a[1] - b[1])
  return scored.slice(0, 4).map(([option]) => option)
}

function split(query) {
  return String(query)
    .split(',')
    .map((name) =>
      name
        .trim()
        .replace(/^fig\./, '')
        .replace(/\(\)$/, '')
    )
    .filter(Boolean)
}

/**
 * The reference text for one or more comma-separated names from any family. `plot` limits it to
 * aster_plot (`figures plot kit radar`). Throws an Error naming the closest names when one is
 * unknown.
 */
export function resolveKitQuery(query, { plot = false } = {}) {
  const parts = []
  const missing = []
  for (const raw of split(query)) {
    const name = !plot && Object.hasOwn(ALIASES, raw) ? ALIASES[raw] : raw
    const found = plot
      ? [plotText(name)]
      : [
          name === 'colors' ? colorsText() : null,
          PAGES[name] ?? null,
          Object.hasOwn(TEMPLATES, name) ? templateText(name) : null,
          kitText(name),
          plotText(name)
            ? `aster_plot (Python data figures; figures plot kit ${name}):\n${plotText(name)}`
            : null
        ]
    const text = found.filter(Boolean).join('\n\n')
    if (text) {
      parts.push(name === raw ? text : `(${raw} is ${name} in the kit)\n${text}`)
    } else {
      missing.push(raw)
    }
  }
  if (missing.length) {
    const hints = missing
      .map((name) => {
        const near = closest(name)
        return near.length ? `"${name}": did you mean ${near.join(', ')}?` : `"${name}"`
      })
      .join('; ')
    const what = plot
      ? 'aster_plot helper, section or kind'
      : 'kit topic, function, template or plot helper'
    const next = plot
      ? '`figures plot kit` lists them all.'
      : `Topics: ${KIT_TOPICS.join(', ')}; \`figures kit\` lists every function.`
    throw new Error(`No ${what} named ${hints}${hints.endsWith('?') ? '' : '.'} ${next}`)
  }
  return parts.join('\n\n')
}
