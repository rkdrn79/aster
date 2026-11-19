// The illustrations a figure can place: objects drawn in the house style by the builder (pure,
// so the app can redraw them) and bundled third-party assets (their metadata, read from
// vendor/illustrations). An index and a search over both, for `figures kit illustrations`.
import { COMPUTE_OBJECTS } from './research-figures-illustration-objects-compute.mjs'
import { LAB_OBJECTS } from './research-figures-illustration-objects-lab.mjs'
import { BIO_OBJECTS } from './research-figures-illustration-objects-bio.mjs'
import { DATA_OBJECTS } from './research-figures-illustration-objects-data.mjs'
import { DEVICE_OBJECTS } from './research-figures-illustration-objects-devices.mjs'
import { SCENE_OBJECTS } from './research-figures-illustration-objects-scene.mjs'
import { isoBuilder } from './research-figures-illustration-iso.mjs'
import { ILLUSTRATION_STYLES } from './research-figures-illustration-paint.mjs'

/** Every drawn object by name, grouped for the index. */
export const OBJECT_GROUPS = {
  compute: COMPUTE_OBJECTS,
  data: DATA_OBJECTS,
  devices: DEVICE_OBJECTS,
  lab: LAB_OBJECTS,
  bio: BIO_OBJECTS,
  scene: SCENE_OBJECTS
}
export const ILLUSTRATION_OBJECTS = Object.assign({}, ...Object.values(OBJECT_GROUPS))

/** Front-view drawings among the objects (the rest are isometric). */
const FRONT_OBJECTS = new Set(['cell', 'dna', 'mouse', 'cloud'])

/** The projection an object is drawn in: `front` for flat drawings, else the builder's view. */
export function objectProjection(name, view = 'iso') {
  return FRONT_OBJECTS.has(name) ? 'front' : view
}

/**
 * Draws a named object into a fresh builder (`view`, `light`) with its `options`; returns the
 * builder, so a caller can read its bounds and write its SVG.
 */
export function drawObject(name, { options = {}, view = 'iso', light = 'left' } = {}) {
  const entry = ILLUSTRATION_OBJECTS[name]
  if (!entry) {
    throw new Error(`No illustration object "${name}"; \`figures kit illustrations\` lists them`)
  }
  const builder = isoBuilder({ view, light })
  entry.draw(builder, options)
  return builder
}

const words = (text) =>
  String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/** One searchable record per object and bundled asset. */
export function illustrationRecords(assets = []) {
  const drawn = Object.entries(OBJECT_GROUPS).flatMap(([group, table]) =>
    Object.entries(table).map(([name, entry]) => ({
      name,
      kind: 'drawn',
      group,
      title: entry.title,
      tags: entry.tags,
      roles: entry.roles,
      options: entry.options ?? [],
      projection: objectProjection(name),
      looks: Object.keys(ILLUSTRATION_STYLES),
      source: 'Aster (drawn by the illustration builder)',
      licence: 'Aster’s own'
    }))
  )
  const bundled = assets.map((asset) => ({
    name: asset.name,
    kind: 'asset',
    group: asset.set,
    title: asset.title,
    tags: asset.tags,
    roles: asset.roles,
    options: [],
    projection: asset.projection ?? 'front',
    looks: asset.looks ?? [asset.style],
    source: asset.source,
    licence: asset.licence,
    credit: asset.credit ?? null
  }))
  return [...drawn, ...bundled]
}

/**
 * Records matching a query, best first: every word of the query must hit the name, the title
 * or a tag ("robot arm", "gpu server", "microscope").
 */
export function searchIllustrations(query, assets = []) {
  const terms = words(query)
  const scored = illustrationRecords(assets).map((record) => {
    const name = words(record.name)
    const title = words(record.title)
    const tags = (record.tags ?? []).flatMap(words)
    let score = 0
    for (const term of terms) {
      const hit = name.includes(term)
        ? 6
        : tags.includes(term)
          ? 4
          : title.includes(term)
            ? 3
            : [...name, ...tags, ...title].some((word) => word.startsWith(term))
              ? 1
              : 0
      if (!hit) {
        return { record, score: 0 }
      }
      score += hit
    }
    return { record, score: score + (record.kind === 'drawn' ? 0.5 : 0) }
  })
  return scored
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score)
    .map((entry) => entry.record)
}

function recordLine(record) {
  const roles = Object.keys(record.roles ?? {}).join('/')
  const options = (record.options ?? []).map((option) => option[0]).join(', ')
  const licence = record.kind === 'asset' ? ` · ${record.licence}` : ''
  return `  ${record.name.padEnd(16)} ${record.title} [${record.projection}; roles ${roles}${options ? `; options ${options}` : ''}]${licence}`
}

/** The index (or a search's hits) as text, for `figures kit illustrations [query]`. */
export function illustrationIndexText(query, assets = []) {
  const records = query ? searchIllustrations(query, assets) : illustrationRecords(assets)
  const lines = [
    query
      ? `Illustrations matching "${query}" (${records.length}):`
      : 'Illustrations: objects drawn in the house style (any look) and bundled assets.',
    'Place one with fig.illustration({ id, asset: <name>, x, y, w, style, roles }); a scene with',
    '{ scene: [{ asset, at: [x, y, z] }] }; `figures kit illustration` prints every option.'
  ]
  if (!records.length) {
    lines.push(
      '  none; draw the object yourself with `draw: (b) => { b.box(…); b.cylinder(…) }` (figures kit illustration)'
    )
    return lines.join('\n')
  }
  const groups = [...new Set(records.map((record) => record.group))]
  for (const group of groups) {
    lines.push(`${group}:`)
    for (const record of records.filter((entry) => entry.group === group)) {
      lines.push(recordLine(record))
    }
  }
  return lines.join('\n')
}
