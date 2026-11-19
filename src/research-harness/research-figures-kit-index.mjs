// The kit reference as text for `figures kit`: a short index of every function by default,
// the full calls with options and defaults for a topic or named functions, or everything.
import { KIT_REFERENCE } from './research-figures-kit-reference.mjs'

export const KIT_TOPICS = [
  'figure',
  'design',
  'shapes',
  'arrows',
  'structure',
  'glyphs',
  'illustrate',
  'illustration',
  'genres',
  'loss',
  'layout',
  'science',
  'schematic',
  'perspective',
  'drawn',
  'plots',
  'art',
  'data',
  'examples'
]

/** What each topic holds, for the index. */
const TOPIC_NOTES = {
  figure: 'open, style, size, save, measure and allow',
  design: 'focus and colour by meaning (focus, colourBy, design); own page',
  shapes: 'boxes, text, math and drawn shapes',
  arrows: 'arrows, residuals, forks, merges, lanes and zooms',
  structure: 'structure first: structure, unet, bus, rails, ring, cylinder; own page',
  glyphs: 'the data: tokens, images, frames, patches, grids, badges',
  illustrate: 'glyphs for overviews and teasers',
  illustration: 'vector pictures and scenes, own page',
  genres: 'pipelines, teasers and qualitative examples',
  loss: 'the objective and what it compares',
  layout: 'panels, templates and placing items',
  science: 'densities, flows, fields, surfaces, 3D scenes and time',
  schematic: 'curve, loop, ellipse, curveManifold, teaserGrid',
  perspective: '3D scenes: rays, cones, tri-planes, rigs; own page',
  drawn:
    'not boxed: tensor, planes, tokenMaps, voxelGrid, filmstrip, pyramid, tiledMatrix, skipArcs, pills',
  plots: 'real data plots inside a diagram',
  art: 'generated art in a hybrid figure, anchored (figures art); own page',
  data: 'Python data figures with aster_plot.py, own page (figures plot kit)',
  examples:
    'whole scripts for hard figures (rays, cones, Swin, U-Net, fan-out, VAR, DenseNet), own page'
}
/**
 * Topics the index shows as one line, their calls on their own page (`figures kit <topic>`):
 * a whole family an agent opens only when the figure needs it.
 */
export const PAGE_TOPICS = new Set([
  'design',
  'illustration',
  'schematic',
  'structure',
  'perspective',
  'drawn',
  'art',
  'data',
  'examples'
])
/** Index lines stop here: the name and what it is, not every clause. */
const BRIEF_LENGTH = 72

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
    'Kit index (H/research-figures-kit.mjs; scripts import ./aster-figures-kit.mjs).',
    '`figures kit <topic|name>` prints the calls with every option and default (`figures kit box,arrow`',
    'for several; `--all` all). Also: examples, colors, icons, templates, library, a template (`figures kit dit`).',
    'Pick references first (`figures refs --figure SLUG --for "…"`); hard figures start from `figures kit examples`.',
    'Units: 144 per inch (1 pt = 2), an 8-unit grid; colours by role names; every item needs an id.',
    ''
  ]
  for (const topic of KIT_TOPICS) {
    lines.push(`${topic}: ${TOPIC_NOTES[topic]}`)
    if (PAGE_TOPICS.has(topic)) {
      continue
    }
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
