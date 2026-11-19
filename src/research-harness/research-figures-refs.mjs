// Reference-guided drawing: `figures refs` picks the 2–3 published figures whose composition and
// glyph vocabulary fit the figure being drawn, prints our text recipe for each and, when a
// reference folder is set up on this computer, the path of its image so the agent can look at it.
// The images are other papers' figures, so none ships with Aster: the folder is the person's own
// (ASTER_FIGURE_REFERENCES, the project's .aster/figures/references.json, Aster's app-data
// `figure-references`, or in a development checkout the ADE work folder beside the repo).
// A figure is never shown its own paper's reference: the figure page's `paper`, the manuscript's
// title, the request naming the paper, or --exclude leave it out.
// A later Library UI could fill the folder: crop a figure from a Library paper's PDF into it and
// have the Figure agent write its recipe beside it, in the RECIPES schema below.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { RECIPES_3D } from './research-figures-refs-recipes-3d.mjs'
import { RECIPES_OTHER, STYLE_DNA } from './research-figures-refs-recipes.mjs'

export const RECIPES = [...RECIPES_3D, ...RECIPES_OTHER]
export { STYLE_DNA }

/** --kind values: a genre (with the words people use for it) or a figure kind. */
const GENRES = {
  '3d-vision': ['3d', 'vision', '3d-vision', 'nerf', 'rendering', 'neural-rendering', 'scene'],
  generative: ['generative', 'generation', 'diffusion', 'video', 'image-generation', 'flow'],
  architecture: [
    'architecture',
    'systems',
    'system',
    'efficiency',
    'sequence',
    'ssm',
    'cnn',
    'kernel'
  ],
  embodied: ['embodied', 'robotics', 'robot', 'agents', 'agent', 'vla', 'manipulation']
}
const KINDS = [...new Set(RECIPES.flatMap((recipe) => recipe.kinds))]

/** Words in a request (Korean too) that name a concept the recipes use. */
const SYNONYMS = {
  광선: 'ray',
  레이: 'ray',
  카메라: 'camera',
  복셀: 'voxel',
  토큰: 'token',
  패치: 'patch',
  해상도: 'resolution',
  스케일: 'scale',
  비디오: 'video',
  영상: 'video',
  프레임: 'frame',
  메모리: 'memory',
  행렬: 'matrix',
  타일: 'tile',
  평면: 'plane',
  밀도: 'density',
  궤적: 'trajectory',
  노이즈: 'noise',
  확산: 'diffusion',
  로봇: 'robot',
  렌더링: 'rendering',
  장면: 'scene',
  계층: 'hierarchy',
  피라미드: 'pyramid',
  연결: 'connection',
  상태: 'state',
  피처: 'feature',
  특징: 'feature'
}

const STOP = new Set(
  'a an the of and or to in on for with by from into as is are be this that it its at our we et al figure fig draw drawn show shows paper model method one two three panel panels left right top bottom vs versus'.split(
    ' '
  )
)

const norm = (text) => String(text ?? '').toLowerCase()
const stem = (word) => word.replace(/(ies)$/, 'y').replace(/(?<=[a-z]{3}[^s])s$/, '')

/** The concept words of a request: lowercase stems, Korean concepts mapped to English. */
/**
 * Words a request uses for a concept the recipes name otherwise: a hierarchy of feature maps is
 * multi-scale, a window grid is a patch grid, a cache is a memory tier.
 */
const CONCEPTS = {
  hierarchical: ['multi-scale', 'resolution', 'staircase'],
  hierarchy: ['multi-scale', 'pyramid'],
  downsampling: ['resolution', 'multi-scale'],
  merging: ['multi-scale', 'resolution'],
  window: ['patch', 'grid'],
  pyramid: ['multi-scale', 'memory'],
  cache: ['memory'],
  sram: ['memory'],
  hbm: ['memory'],
  gpu: ['memory', 'hardware'],
  tiling: ['tile', 'block'],
  video: ['frame'],
  temporal: ['frame', 'video'],
  latent: ['tensor', 'feature'],
  unet: ['skip', 'resolution'],
  skip: ['connection'],
  voxel: ['grid'],
  splat: ['gaussian'],
  sde: ['trajectory', 'density', 'noise'],
  ode: ['trajectory', 'density'],
  vla: ['robot', 'action', 'token'],
  manipulation: ['robot', 'action']
}

export function queryTerms(text) {
  const raw = norm(text)
  const terms = new Set()
  for (const word of raw.match(/[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z]/g) ?? []) {
    if (!STOP.has(word)) {
      terms.add(stem(word))
      for (const related of CONCEPTS[stem(word)] ?? CONCEPTS[word] ?? []) {
        terms.add(related)
      }
    }
  }
  for (const [korean, english] of Object.entries(SYNONYMS)) {
    if (raw.includes(korean)) {
      terms.add(english)
    }
  }
  return [...terms]
}

const recipeText = (recipe) =>
  norm(
    [
      recipe.summary,
      recipe.layout,
      ...recipe.glyphs,
      ...recipe.colour,
      recipe.emphasis,
      ...recipe.handmade
    ].join(' ')
  )

/** How well a recipe fits the terms: keywords count most, then kinds and genre, then its text. */
export function scoreRecipe(recipe, terms, documentFrequency = () => 1) {
  const keywords = recipe.keywords.map(norm)
  const text = recipeText(recipe)
  const kinds = [recipe.genre, ...recipe.kinds].map(norm)
  let score = 0
  const matched = []
  for (const term of terms) {
    const weight = Math.log(1 + RECIPES.length / Math.max(1, documentFrequency(term)))
    let hit = 0
    if (keywords.some((keyword) => keyword.split(/\s+/).map(stem).includes(term))) {
      hit = 3
    } else if (kinds.some((kind) => kind.split('-').includes(term))) {
      hit = 2
    } else if (new RegExp(`\\b${term.replace(/[^a-z0-9]/g, '.')}`).test(text)) {
      hit = 1
    }
    if (hit) {
      score += hit * weight
      matched.push(term)
    }
  }
  return { score, matched }
}

/** Whether a value (an id, an arXiv id, an alias or a title) names this recipe's paper. */
export function namesPaper(recipe, value) {
  const given = norm(value).trim()
  if (!given) {
    return false
  }
  const flat = (text) => norm(text).replace(/[^a-z0-9]+/g, '')
  const mainTitle = recipe.title.split(':')[0]
  return (
    given === recipe.id ||
    given.replace(/^arxiv:?\s*/, '') === recipe.arxiv ||
    recipe.aliases.some((alias) => flat(alias) === flat(given)) ||
    flat(given) === flat(recipe.title) ||
    (flat(mainTitle).length >= 4 && flat(given) === flat(mainTitle))
  )
}

/**
 * Whether free text (a request, a manuscript title) names the recipe's paper: its arXiv id, its
 * full title, or a name followed by paper / 논문 / figure ("the NeRF paper", "RT-2 논문의 Figure 1").
 */
export function textNamesPaper(recipe, text) {
  const raw = norm(text)
  if (!raw) {
    return false
  }
  if (raw.includes(recipe.arxiv)) {
    return true
  }
  const title = norm(recipe.title.split(':').at(-1)).trim()
  if (title.split(/\s+/).length >= 4 && raw.includes(title)) {
    return true
  }
  const names = [recipe.title.split(':')[0], ...recipe.aliases.slice(0, 1)]
  return names.some((name) => {
    const escaped = norm(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(
      `(^|[^a-z0-9])${escaped}(?![a-z0-9])\\s*(?:'s\\s+)?(paper|논문|figure|fig\\.|\\()`
    ).test(raw)
  })
}

const exists = (file) => {
  try {
    return existsSync(file)
  } catch {
    return false
  }
}

/** Aster's per-person folder for reference figures (where a Library UI would put them). */
export function appReferenceFolder() {
  const home = os.homedir()
  if (process.platform === 'darwin') {
    return path.join(home, 'Library/Application Support/Aster/figure-references')
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA ?? path.join(home, 'AppData/Roaming'),
      'Aster/figure-references'
    )
  }
  return path.join(
    process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'),
    'Aster/figure-references'
  )
}

/** The project's reference settings (.aster/figures/references.json), or {}. */
async function projectSettings(project) {
  for (const root of ['.aster', 'research']) {
    try {
      return JSON.parse(await readFile(path.join(project, root, 'figures/references.json'), 'utf8'))
    } catch {
      // Why: no settings is the usual case.
    }
  }
  return {}
}

/** In a development checkout: the ADE work folder of references beside the repo, if present. */
function devFolder() {
  let current = import.meta.dirname
  for (let depth = 0; depth < 8; depth += 1) {
    for (const candidate of [
      path.join(current, 'work/aster-figure-references'),
      path.join(current, 'ADE/work/aster-figure-references')
    ]) {
      if (exists(path.join(candidate, 'img'))) {
        return candidate
      }
    }
    const parent = path.dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }
  return null
}

/** Where the reference images are: { dir, from } or null when none is set up here. */
export async function referenceLibrary(project, explicit = null) {
  const settings = await projectSettings(project)
  const candidates = [
    [explicit, '--library'],
    [process.env.ASTER_FIGURE_REFERENCES, 'ASTER_FIGURE_REFERENCES'],
    [
      settings.library ? path.resolve(project, settings.library) : null,
      '.aster/figures/references.json'
    ],
    [appReferenceFolder(), "Aster's app data"],
    [devFolder(), 'the development folder']
  ]
  for (const [dir, from] of candidates) {
    if (dir && exists(dir)) {
      return { dir: path.resolve(dir), from }
    }
  }
  return null
}

/** The image of a reference in the folder: refs.json's entry, else img/<id>.png or <id>.png. */
export function referenceImage(library, id) {
  if (!library) {
    return null
  }
  let listed = null
  try {
    const index = JSON.parse(readFileSync(path.join(library.dir, 'refs.json'), 'utf8'))
    listed = (index.figures ?? []).find((entry) => entry.name === id || entry.id === id)?.image
  } catch {
    listed = null
  }
  const options = [
    listed && path.join(library.dir, listed),
    ...['png', 'jpg', 'jpeg'].flatMap((ext) => [
      path.join(library.dir, 'img', `${id}.${ext}`),
      path.join(library.dir, `${id}.${ext}`)
    ])
  ].filter(Boolean)
  return options.find(exists) ?? null
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg']
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024

/** Image files directly in a folder (not hidden ones), sorted; [] when it is not there. */
function imageFilesIn(folder) {
  try {
    return readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^[^.].*\.(png|jpe?g)$/i.test(entry.name))
      .map((entry) => entry.name)
      .toSorted()
  } catch {
    return []
  }
}

/**
 * Everything in a reference folder: { dir, exists, entries }. Every recipe first (its image when
 * the folder has one), then the person's own images, which have no recipe: refs.json entries and
 * img/*.png|jpg|jpeg, then *.png|jpg|jpeg beside them, each named by its file.
 */
export function listReferenceLibrary(dir) {
  const given = typeof dir === 'string' && dir ? path.resolve(dir) : null
  const present = given !== null && exists(given)
  const library = present ? { dir: given } : null
  const entries = RECIPES.map((recipe) => ({
    id: recipe.id,
    image: referenceImage(library, recipe.id),
    title: recipe.title,
    year: recipe.year,
    genre: recipe.genre,
    recipe: true
  }))
  if (!present) {
    return { dir: given, exists: false, entries }
  }
  const recipeIds = new Set(RECIPES.map((recipe) => recipe.id))
  const seen = new Set()
  const add = (id, image, meta = {}) => {
    if (!id || seen.has(id) || recipeIds.has(id)) {
      return
    }
    seen.add(id)
    entries.push({
      id,
      image,
      title: typeof meta.title === 'string' ? meta.title : null,
      year: Number.isInteger(meta.year) ? meta.year : null,
      genre: typeof meta.genre === 'string' ? meta.genre : null,
      recipe: false
    })
  }
  let index = null
  try {
    index = JSON.parse(readFileSync(path.join(given, 'refs.json'), 'utf8'))
  } catch {
    index = null
  }
  for (const entry of Array.isArray(index?.figures) ? index.figures : []) {
    const image = typeof entry?.image === 'string' ? path.join(given, entry.image) : null
    if (image && exists(image)) {
      add(String(entry.name ?? entry.id ?? ''), image, entry)
    }
  }
  for (const folder of [path.join(given, 'img'), given]) {
    for (const name of imageFilesIn(folder)) {
      add(name.replace(/\.[^.]+$/, ''), path.join(folder, name))
    }
  }
  return { dir: given, exists: true, entries }
}

/** A file name as a reference id: lowercase a–z, 0–9 and dashes, 60 characters at most. */
function referenceSlug(name) {
  const slug = String(name ?? '')
    .replace(/\.[A-Za-z0-9]{1,5}$/, '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return slug || 'reference'
}

/** PNG or JPEG by its first bytes: the extension to save under, else null. */
function referenceExtension(bytes) {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png'
  }
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    ? 'jpg'
    : null
}

/**
 * Saves the person's own reference image (base64, a data URL's prefix is fine) as
 * <dir>/img/<id>.png|jpg, the id from the file name made unique among the images there:
 * { id, image }. An id equal to a recipe's becomes that recipe's image.
 */
export async function addReferenceImage(dir, name, base64) {
  const text = String(base64 ?? '').replace(/^data:[^,]*,/, '')
  if (text.length > Math.ceil((MAX_REFERENCE_BYTES * 4) / 3) + 8) {
    throw new Error('A reference image can be at most 20 MB.')
  }
  const bytes = Buffer.from(text, 'base64')
  const extension = referenceExtension(bytes)
  if (!extension) {
    throw new Error('Only PNG or JPEG images can be references.')
  }
  if (bytes.length > MAX_REFERENCE_BYTES) {
    throw new Error('A reference image can be at most 20 MB.')
  }
  const root = path.resolve(dir)
  const taken = (id) =>
    IMAGE_EXTENSIONS.some(
      (ext) =>
        exists(path.join(root, 'img', `${id}.${ext}`)) || exists(path.join(root, `${id}.${ext}`))
    )
  const base = referenceSlug(name)
  let id = base
  for (let count = 2; taken(id); count += 1) {
    id = `${base.slice(0, 60 - String(count).length - 1)}-${String(count)}`
  }
  await mkdir(path.join(root, 'img'), { recursive: true })
  const image = path.join(root, 'img', `${id}.${extension}`)
  await writeFile(image, bytes, { flag: 'wx' })
  return { id, image }
}

/** The manuscript's \title{…}, when the project has one. */
async function manuscriptTitle(project, manuscript) {
  if (!manuscript) {
    return null
  }
  try {
    const tex = await readFile(path.join(project, manuscript), 'utf8')
    return tex.match(/\\title(?:\[[^\]]*\])?\{([^}]*)\}/)?.[1] ?? null
  } catch {
    return null
  }
}

/**
 * The references a figure must not see, with why: `exclude` (ids, names or arXiv ids), the
 * figure page's paper, the project's settings, the manuscript's title, the request naming it.
 */
export async function excludedReferences(
  project,
  { exclude = [], page = null, text = '', manuscript = null } = {}
) {
  const settings = await projectSettings(project)
  const out = new Map()
  const add = (recipe, why) => {
    if (!out.has(recipe.id)) {
      out.set(recipe.id, why)
    }
  }
  const values = [
    ...exclude.map((value) => [value, 'asked to leave out']),
    ...String(process.env.ASTER_FIGURE_REFS_EXCLUDE ?? '')
      .split(',')
      .map((value) => [value, 'ASTER_FIGURE_REFS_EXCLUDE']),
    ...(settings.exclude ?? []).map((value) => [value, 'the project leaves it out'])
  ]
  const paper = page?.paper
  for (const value of typeof paper === 'string'
    ? [paper]
    : paper
      ? [paper.id, paper.arxiv, paper.title]
      : []) {
    values.push([value, "this figure's own paper"])
  }
  const title = await manuscriptTitle(project, manuscript)
  for (const recipe of RECIPES) {
    for (const [value, why] of values) {
      if (namesPaper(recipe, value)) {
        add(recipe, why)
      }
    }
    if (title && (namesPaper(recipe, title) || textNamesPaper(recipe, title))) {
      add(recipe, 'the manuscript is that paper')
    }
    if (textNamesPaper(recipe, text)) {
      add(recipe, 'the request names that paper')
    }
  }
  return out
}

/** The kinds --kind accepts. */
export function referenceKinds() {
  return { genres: Object.keys(GENRES), kinds: KINDS }
}

function kindFilter(kind) {
  if (!kind) {
    return () => true
  }
  const wanted = norm(kind)
  const genre = Object.entries(GENRES).find(
    ([name, words]) => name === wanted || words.includes(wanted)
  )
  if (genre) {
    return (recipe) => recipe.genre === genre[0]
  }
  if (KINDS.includes(wanted)) {
    return (recipe) => recipe.kinds.includes(wanted)
  }
  throw new Error(
    `No kind "${kind}". Genres: ${Object.keys(GENRES).join(', ')} (or ${Object.values(GENRES).flat().join(', ')}); kinds: ${KINDS.join(', ')}`
  )
}

/**
 * The closest references: { picked: [{ recipe, score, matched, image, pinned }], excluded,
 * library, unknownPins }. `count` (default 3) at most; with a request, only those that match it
 * at all. `pin` ids come first, in the order given: a recipe, or an image of the person's own in
 * the folder (an entry with `recipe: null`); one left out stays out, one the folder lacks lands
 * in `unknownPins`. The total is then at least as many as were pinned.
 */
export async function pickReferences(project, options = {}) {
  const {
    kind = null,
    text = '',
    count = 3,
    exclude = [],
    page = null,
    manuscript = null
  } = options
  const library = await referenceLibrary(project, options.library)
  const excluded = await excludedReferences(project, { exclude, page, text, manuscript })
  const fits = kindFilter(kind)
  const pool = RECIPES.filter((recipe) => fits(recipe) && !excluded.has(recipe.id))
  const terms = queryTerms(text)
  const frequency = (term) =>
    RECIPES.filter((recipe) => scoreRecipe(recipe, [term]).score > 0).length
  const rounded = (score) => Math.round(score * 10) / 10
  const pins = [...new Set((options.pin ?? []).map((id) => String(id).trim()).filter(Boolean))]
  const pinned = []
  const unknownPins = []
  for (const id of pins) {
    const recipe = RECIPES.find((entry) => entry.id === norm(id))
    if (recipe) {
      if (!excluded.has(recipe.id) && !pinned.some((entry) => entry.recipe?.id === recipe.id)) {
        const { score, matched } = scoreRecipe(recipe, terms, frequency)
        pinned.push({
          recipe,
          score: rounded(score),
          matched,
          image: referenceImage(library, recipe.id),
          pinned: true
        })
      }
      continue
    }
    const image = referenceImage(library, id)
    if (image) {
      pinned.push({ recipe: null, id, image, matched: [], score: 0, pinned: true })
    } else {
      unknownPins.push(id)
    }
  }
  const taken = new Set(pinned.flatMap((entry) => (entry.recipe ? [entry.recipe.id] : [])))
  const ranked = pool
    .filter((recipe) => !taken.has(recipe.id))
    .map((recipe) => ({ recipe, ...scoreRecipe(recipe, terms, frequency) }))
    .filter((entry) => !terms.length || entry.score > 0)
    .toSorted((first, second) => second.score - first.score)
  const total = Math.max(1, count, pins.length)
  const picked = [
    ...pinned,
    ...ranked.slice(0, Math.max(0, total - pinned.length)).map((entry) => ({
      ...entry,
      score: rounded(entry.score),
      image: referenceImage(library, entry.recipe.id),
      pinned: false
    }))
  ]
  return { picked, excluded, library, terms, kind, unknownPins }
}
