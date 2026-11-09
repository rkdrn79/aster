// The kit reference as text for `figures kit`: a short index of every function by default,
// the full calls with options and defaults for a topic or named functions, or everything.
import { KIT_REFERENCE } from './research-figures-kit-reference.mjs'

export const KIT_TOPICS = [
  'figure',
  'shapes',
  'arrows',
  'glyphs',
  'illustrate',
  'genres',
  'loss',
  'layout'
]

/** What each topic holds, for the index. */
const TOPIC_NOTES = {
  figure: 'open, style, size, save, measure and allow',
  shapes: 'boxes, text, math and drawn shapes',
  arrows: 'arrows, residuals, forks, merges, lanes and zooms',
  glyphs: 'the data: tokens, images, frames, patches, grids, badges',
  illustrate: 'illustration glyphs for overviews and teasers',
  genres: 'pipelines, teasers and qualitative examples',
  loss: 'the objective and what it compares',
  layout: 'panels, templates and placing items'
}
/** Index lines stop here: the name and what it is, not every clause. */
const BRIEF_LENGTH = 92

function brief(does) {
  const first = does.split(/(?<=\.)\s/)[0].replace(/[:;]$/, '')
  if (first.length <= BRIEF_LENGTH) {
    return first
  }
  return `${first.slice(0, first.lastIndexOf(' ', BRIEF_LENGTH - 1))} …`
}

/**
 * `figures kit` alone: every topic with its functions on one line each, short enough to read
 * whole; the calls, options and defaults come from `figures kit <topic|name>` or `--all`.
 */
export function kitIndexText() {
  const lines = [
    'Kit index (H/research-figures-kit.mjs; scripts import it through ./aster-figures-kit.mjs).',
    '`figures kit <topic|name>` prints the calls with every option and default (names may be comma-separated:',
    '`figures kit box,arrow`); `figures kit --all` prints everything. Also: colors, icons, templates, library,',
    'and a template by name (`figures kit dit`).',
    'Units: 144 per inch (1 pt = 2), boxes on an 8-unit grid; colours by role names. Ids: every item needs one.',
    ''
  ]
  for (const topic of KIT_TOPICS) {
    lines.push(`${topic}: ${TOPIC_NOTES[topic]}`)
    for (const entry of KIT_REFERENCE.filter((item) => item.topic === topic)) {
      lines.push(`  ${entry.name.padEnd(12)} ${brief(entry.does)}`)
    }
  }
  return lines.join('\n')
}

/** The entries one query names: a topic, a function (`box` or `fig.box`), or several, comma-separated. */
function chosenEntries(query) {
  const names = String(query)
    .split(',')
    .map((name) =>
      name
        .trim()
        .replace(/^fig\./, '')
        .replace(/\(\)$/, '')
    )
    .filter(Boolean)
  const missing = names.filter(
    (name) => !KIT_REFERENCE.some((entry) => entry.topic === name || entry.name === name)
  )
  if (missing.length) {
    throw new Error(
      `No kit topic or function "${missing.join('", "')}". Topics: ${KIT_TOPICS.join(', ')}; \`figures kit\` lists every function`
    )
  }
  return KIT_REFERENCE.filter((entry) =>
    names.some((name) => entry.topic === name || entry.name === name)
  )
}

/** The reference as text: one topic, one or more functions, or everything. */
export function kitReferenceText(query) {
  const chosen = query ? chosenEntries(query) : KIT_REFERENCE
  const lines = query
    ? []
    : [
        `Kit reference (H/research-figures-kit.mjs). Topics: ${KIT_TOPICS.join(', ')}; \`figures kit <topic|name>\` prints one.`,
        'Units: 144 per inch (1 pt = 2), boxes on an 8-unit grid; rows and columns line up exactly. Colours by role; the loss in ink unless asked. Ids: every item needs one.',
        ''
      ]
  for (const entry of chosen) {
    lines.push(entry.call, `  ${entry.does}`)
    for (const [name, value, meaning] of entry.options ?? []) {
      lines.push(`  ${name.padEnd(28)} ${String(value || '—').padEnd(22)} ${meaning}`.trimEnd())
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}
