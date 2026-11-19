// Rebuilds src/research-harness/vendor/illustrations: a curated starter set of open-licensed
// illustrations recoloured into the kit's colour roles, so they repaint with a figure's palette
// and sit beside the drawn objects. Fluent Emoji Flat (MIT) for flat front-view objects, IBM
// Carbon pictograms (Apache-2.0, no IBM-brand items) for line art. Each source is pinned to a
// commit; SOURCES.json records the source, licence, house style, roles and tags of each file.
// Run: node config/scripts/vendor-figure-illustrations.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { hexToOklch } from '../../src/research-harness/research-figures-palette.mjs'
import { TONE_L } from '../../src/research-harness/research-figures-illustration-paint.mjs'

const FLUENT_COMMIT = '1ffb34c752ecf5d402f04cfb4b392c77f57c54bc'
const CARBON_COMMIT = 'f615c75c44f550522a81456cb31c25ad2196cbf2'
const root = path.resolve(import.meta.dirname, '../..')
const out = path.join(root, 'src/research-harness/vendor/illustrations')
const fetchText = (url) => execFileSync('curl', ['-sSfL', url], { encoding: 'utf8' })

/**
 * Fluent Emoji Flat: [name, asset folder, title, tags, accent fills (the source hexes of the one
 * part that may take the accent; none keeps the object neutral, as data examples should be)].
 */
/**
 * @param {string} name
 * @param {string} folder
 * @param {string} title
 * @param {string[]} tags
 * @param {string[]} accent
 */
const fluent = (name, folder, title, tags, accent) => ({ name, folder, title, tags, accent })
const FLUENT = [
  fluent('cat', 'Cat', 'Cat', ['cat', 'animal', 'pet', 'image', 'example'], []),
  fluent('dog', 'Dog', 'Dog', ['dog', 'animal', 'pet', 'image', 'example'], []),
  fluent('bird', 'Bird', 'Bird', ['bird', 'animal', 'image', 'example'], []),
  fluent(
    'airplane',
    'Airplane',
    'Airplane',
    ['airplane', 'plane', 'aircraft', 'vehicle', 'flight'],
    []
  ),
  fluent('bicycle', 'Bicycle', 'Bicycle', ['bicycle', 'bike', 'vehicle', 'cycling'], []),
  fluent(
    'satellite',
    'Satellite',
    'Satellite',
    ['satellite', 'space', 'orbit', 'remote', 'sensing', 'earth', 'observation'],
    []
  ),
  fluent('factory', 'Factory', 'Factory', ['factory', 'industry', 'manufacturing', 'plant'], []),
  fluent('house', 'House', 'House', ['house', 'home', 'building', 'household'], []),
  fluent(
    'hospital',
    'Hospital',
    'Hospital',
    ['hospital', 'clinic', 'medicine', 'healthcare', 'building'],
    []
  ),
  fluent(
    'microbe',
    'Microbe',
    'Microbe (bacterium, virus)',
    ['microbe', 'bacterium', 'bacteria', 'virus', 'pathogen', 'germ'],
    ['*']
  ),
  fluent('pill', 'Pill', 'Pill (drug)', ['pill', 'drug', 'medicine', 'capsule', 'pharma'], ['*']),
  fluent(
    'tree',
    'Deciduous tree',
    'Tree',
    ['tree', 'nature', 'plant', 'outdoor', 'environment'],
    []
  )
]

/** Carbon pictograms: [name, file, title, tags]. Line art, one ink. */
/**
 * @param {string} name
 * @param {string} file
 * @param {string} title
 * @param {string[]} tags
 */
const carbon = (name, file, title, tags) => ({ name, file, title, tags })
const CARBON = [
  carbon('robot-arm-line', 'robotics', 'Industrial robot arm (line)', [
    'robot',
    'arm',
    'robotics',
    'manipulator',
    'industrial',
    'line'
  ]),
  carbon('microscope-line', 'microscope', 'Microscope (line)', [
    'microscope',
    'lab',
    'biology',
    'imaging',
    'line'
  ]),
  carbon('dna-line', 'dna', 'DNA (line)', ['dna', 'genome', 'gene', 'sequence', 'biology', 'line']),
  carbon('electric-car-line', 'electric--car', 'Electric car (line)', [
    'car',
    'vehicle',
    'electric',
    'driving',
    'line'
  ]),
  carbon('globe-line', 'globe', 'Globe (line)', ['globe', 'world', 'earth', 'web', 'line']),
  carbon('drone-line', 'drone', 'Drone (line)', [
    'drone',
    'uav',
    'quadcopter',
    'aerial',
    'robot',
    'line'
  ]),
  carbon('data-scientist-line', 'data--scientist', 'Data scientist (line)', [
    'person',
    'scientist',
    'analyst',
    'user',
    'line'
  ]),
  carbon('flask-line', 'erlenmeyer--flask', 'Erlenmeyer flask (line)', [
    'flask',
    'chemistry',
    'lab',
    'experiment',
    'line'
  ])
]

const r2 = (value) => Math.round(value * 100) / 100
const nearestTone = (L, low = 0, high = 10) => {
  let best = low
  for (let tone = low; tone <= high; tone += 1) {
    if (Math.abs(TONE_L[tone] - L) < Math.abs(TONE_L[best] - L)) {
      best = tone
    }
  }
  return best
}

/** Tags each filled shape with a colour role and tone: the accent part, else gray by lightness. */
function recolourFluent(svg, accentFills) {
  const hexes = [
    ...new Set([...svg.matchAll(/fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1].toLowerCase()))
  ]
  const chromatic = hexes.filter((hex) => hexToOklch(hex).C >= 0.04)
  const accent = new Set(
    accentFills.includes('*') ? chromatic : accentFills.map((hex) => hex.toLowerCase())
  )
  // Why by rank: the source's own grays (and its non-accent colours) keep their order on the
  // light end of the ramp, a step apart, so objects stay quiet and their parts still show.
  const RANK_TONES = [1, 2, 4, 6, 8]
  const grays = hexes
    .filter((hex) => !accent.has(hex))
    .map((hex) => ({ hex, L: hexToOklch(hex).L }))
    .filter(({ L }) => L >= 0.3 && L <= 0.96)
    .toSorted((a, b) => b.L - a.L)
  const roleOf = (hex) => {
    const { L } = hexToOklch(hex)
    if (accent.has(hex)) {
      return ['accent', nearestTone(L, 1, 9)]
    }
    if (L < 0.3) {
      return ['neutral', 10]
    }
    if (L > 0.96) {
      return ['neutral', 0]
    }
    const rank = grays.findIndex((entry) => entry.hex === hex)
    return ['neutral', RANK_TONES[Math.min(rank, RANK_TONES.length - 1)]]
  }
  const body = svg
    .replace(/<\?xml[^>]*>|<!--[\s\S]*?-->/g, '')
    .replace(/<svg\b[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/\sfill="(#[0-9A-Fa-f]{6})"/g, (_, hex) => {
      const [role, tone] = roleOf(hex.toLowerCase())
      return ` data-r="${role}" data-t="${tone}" data-s="0" fill="${hex.toLowerCase()}"`
    })
    .replace(/>\s+</g, '><')
    .trim()
  return {
    body,
    roles: accent.size
      ? { accent: 'the subject part', neutral: 'the rest' }
      : { neutral: 'all of it' }
  }
}

/** Carbon's single-ink pictograms: every shape takes the figure's ink. */
function recolourCarbon(svg) {
  const body = svg
    .replace(/<\?xml[^>]*>|<!--[\s\S]*?-->/g, '')
    .replace(/<svg\b[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/\sid="[^"]*"/g, '')
    .replace(/<(path|circle|rect|polygon|ellipse)\b/g, '<$1 data-r="ink" data-t="0" fill="#000000"')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()
  return { body, roles: { ink: 'the line art' } }
}

const wrap = (body, look) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" data-aster-illustration="1" data-look="${look}" data-ppt="1">${body}</svg>\n`

mkdirSync(path.join(out, 'fluent'), { recursive: true })
mkdirSync(path.join(out, 'carbon'), { recursive: true })
const sources = {}
const fluentBase = `https://raw.githubusercontent.com/microsoft/fluentui-emoji/${FLUENT_COMMIT}`
writeFileSync(path.join(out, 'fluent/LICENSE'), fetchText(`${fluentBase}/LICENSE`))
for (const { name, folder, title, tags, accent: accentFills } of FLUENT) {
  const file = `${folder.toLowerCase().replaceAll(' ', '_')}_flat.svg`
  const url = `${fluentBase}/assets/${encodeURIComponent(folder)}/Flat/${file}`
  const { body, roles } = recolourFluent(fetchText(url), accentFills)
  writeFileSync(path.join(out, `fluent/${name}.svg`), wrap(body, 'flat'))
  sources[name] = {
    set: 'fluent',
    file: `fluent/${name}.svg`,
    title,
    tags,
    style: 'flat',
    projection: 'front',
    roles,
    source: url,
    licence: 'MIT (Microsoft Fluent Emoji)',
    credit: null
  }
}
const carbonBase = `https://raw.githubusercontent.com/carbon-design-system/carbon/${CARBON_COMMIT}`
writeFileSync(path.join(out, 'carbon/LICENSE'), fetchText(`${carbonBase}/LICENSE`))
for (const { name, file, title, tags } of CARBON) {
  const url = `${carbonBase}/packages/pictograms/src/svg/${file}.svg`
  const { body, roles } = recolourCarbon(fetchText(url))
  writeFileSync(path.join(out, `carbon/${name}.svg`), wrap(body, 'line'))
  sources[name] = {
    set: 'carbon',
    file: `carbon/${name}.svg`,
    title,
    tags,
    style: 'line',
    projection: 'front',
    roles,
    // Why: the stroke is drawn as filled outlines 0.72/32 of the width, so the size sets it.
    lineWeight: r2(0.72 / 32),
    source: url,
    licence: 'Apache-2.0 (IBM Carbon Design System pictograms)',
    credit: null
  }
}
writeFileSync(path.join(out, 'SOURCES.json'), `${JSON.stringify(sources, null, 2)}\n`)
console.log(Object.keys(sources).join(' '))
