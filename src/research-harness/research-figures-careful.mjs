// Careful drawing (`figures careful`): the Figure agent sketches 3–4 compositions, one is chosen,
// then N rounds of review by a separate art director chat that Aster starts. The harness keeps
// the progress, writes each round's request, and reads the art director's address; the app writes
// the critic file and, when the person picks, the choice.
//
// Everything lives in the figure's own folder F (beside its .excalidraw), kept out of Git:
//   F/.careful/.gitignore           `*`
//   F/.careful/<slug>.json          progress (harness-owned, written atomically)
//   F/.careful/<slug>.critic.json   { address, agent, startedAt }: the app writes it, we only read
//   F/.careful/<slug>/s1..s4.excalidraw   the sketches
//   F/.careful/<slug>.round<k>.md   the request sent to the art director in round k
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { designFrame } from './research-figures-design.mjs'
import { listFigures, sha256 } from './research-figures-folders.mjs'
import { figurePage, figurePreviewPaths } from './research-figures-model.mjs'
import { RECIPES, referenceImage, referenceLibrary } from './research-figures-refs.mjs'
import { FIGURE_ART_DIRECTOR_RULE } from './research-figures-style-rules.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { projectLayout } from './research-layout.mjs'

export const CAREFUL_FOLDER = '.careful'
export const DEFAULT_ROUNDS = 3
export const MAX_ROUNDS = 10
export const SKETCH_NAMES = ['s1', 's2', 's3', 's4']
const MAX_FIXES = 12
const START_FIRST = (slug) =>
  `Start careful drawing first: figures careful --figure ${slug} --start --rounds N`

const now = () => new Date().toISOString()
const exists = (file) =>
  stat(file).then(
    () => true,
    () => false
  )
const readJson = (file) =>
  readFile(file, 'utf8').then(
    (text) => JSON.parse(text),
    () => null
  )

/** The figure's careful-drawing files, from `listFigures` (an unknown slug is not_found). */
export async function carefulContext(project, slug) {
  const { figures } = await listFigures(project)
  const figure = figures.find((entry) => entry.slug === slug)
  if (!figure) {
    throw new HarnessError('not_found', `No figure ${slug}`)
  }
  const folder = path.dirname(path.join(project, figure.scene))
  const careful = path.join(folder, CAREFUL_FOLDER)
  return {
    project,
    slug,
    figure,
    scene: path.join(project, figure.scene),
    careful,
    progress: path.join(careful, `${slug}.json`),
    critic: path.join(careful, `${slug}.critic.json`),
    sketchDir: path.join(careful, slug),
    sketchFile: (name) => path.join(careful, slug, `${name}.excalidraw`),
    bodyFile: (round) => path.join(careful, `${slug}.round${String(round)}.md`)
  }
}

/** The progress record, or null before `--start` (or when the file is not ours). */
export async function readProgress(ctx) {
  const record = await readJson(ctx.progress)
  return record && typeof record === 'object' && record.version === 1 ? record : null
}

async function requireProgress(ctx) {
  const record = await readProgress(ctx)
  if (!record) {
    throw new HarnessError('invalid_argument', START_FIRST(ctx.slug))
  }
  return record
}

/** The folders and the `.gitignore` that keeps all of it out of Git; safe to call again. */
async function ensureFolders(ctx) {
  await mkdir(ctx.sketchDir, { recursive: true })
  await writeFile(path.join(ctx.careful, '.gitignore'), '*\n', { flag: 'wx' }).catch((error) => {
    if (error?.code !== 'EEXIST') {
      throw error
    }
  })
}

/** Writes the record atomically (temp file, then rename), stamping updatedAt. */
async function writeProgress(ctx, record) {
  await ensureFolders(ctx)
  const next = { ...record, updatedAt: now() }
  const temp = `${ctx.progress}.${String(process.pid)}.tmp`
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`)
  await rename(temp, ctx.progress)
  return next
}

/** The art director the app started: { address, agent, startedAt }, or null. */
export async function readCritic(ctx) {
  const critic = await readJson(ctx.critic)
  return typeof critic?.address === 'string' && critic.address ? critic : null
}

/** Whether the critic file is older than the last ask for a new one (its chat has ended). */
function criticIsStale(critic, record) {
  return (
    Boolean(critic && record.wantCritic) &&
    Date.parse(critic.startedAt) < Date.parse(record.wantCritic)
  )
}

/** `--start`: makes the folders and resets the sketches, the choice, the reviews and the end. */
export async function startCareful(ctx, rounds) {
  const state = await writeProgress(ctx, {
    version: 1,
    slug: ctx.slug,
    rounds,
    startedAt: now(),
    sketches: [],
    chose: null,
    reviews: [],
    done: null,
    wantCritic: null
  })
  return { action: 'start', slug: ctx.slug, state, sketchFiles: SKETCH_NAMES.map(ctx.sketchFile) }
}

/** `s1: note | s2: note`: the sketches, at least two, each s1..s4 once. */
export function parseSketches(text) {
  const sketches = []
  for (const part of String(text)
    .split('|')
    .map((piece) => piece.trim())) {
    if (!part) {
      continue
    }
    const colon = part.indexOf(':')
    const name = (colon === -1 ? part : part.slice(0, colon)).trim().toLowerCase()
    if (!SKETCH_NAMES.includes(name)) {
      throw new HarnessError(
        'invalid_argument',
        `Each sketch starts with s1, s2, s3 or s4 and a colon, got "${part.slice(0, 40)}": --sketches "s1: note | s2: note | s3: note"`
      )
    }
    if (sketches.some((sketch) => sketch.name === name)) {
      throw new HarnessError('invalid_argument', `${name} is listed twice in --sketches`)
    }
    sketches.push({ name, note: colon === -1 ? '' : part.slice(colon + 1).trim() })
  }
  if (sketches.length < 2) {
    throw new HarnessError(
      'invalid_argument',
      'Record at least 2 sketches: --sketches "s1: note | s2: note | s3: note"'
    )
  }
  return sketches.toSorted((first, second) => first.name.localeCompare(second.name))
}

/** `--sketches`: records them; a missing or unreadable sketch file is a warning, not a failure. */
export async function recordSketches(ctx, text) {
  const record = await requireProgress(ctx)
  const sketches = parseSketches(text)
  const warnings = []
  for (const { name } of sketches) {
    const file = ctx.sketchFile(name)
    const content = await readFile(file, 'utf8').catch(() => null)
    if (content === null) {
      warnings.push(
        `${name}: ${file} is missing; copy the figure file there and draw one rough composition in it.`
      )
      continue
    }
    try {
      JSON.parse(content)
    } catch {
      warnings.push(`${name}: ${file} is not valid JSON, so Aster cannot open it.`)
    }
  }
  const state = await writeProgress(ctx, { ...record, sketches })
  return { action: 'sketches', slug: ctx.slug, state, warnings }
}

/** `--chose sK`: one recorded sketch (or an existing sketch file), by the agent or the person. */
export async function chooseSketch(ctx, name, { why = '', by = 'agent' } = {}) {
  const record = await requireProgress(ctx)
  const picked = String(name).trim().toLowerCase()
  if (!SKETCH_NAMES.includes(picked)) {
    throw new HarnessError('invalid_argument', `--chose takes ${SKETCH_NAMES.join(', ')}`)
  }
  if (by !== 'agent' && by !== 'person') {
    throw new HarnessError('invalid_argument', '--by must be agent or person')
  }
  if (
    !record.sketches.some((sketch) => sketch.name === picked) &&
    !(await exists(ctx.sketchFile(picked)))
  ) {
    throw new HarnessError(
      'invalid_argument',
      `No sketch ${picked}: record the sketches first (--sketches "s1: … | s2: …") or draw ${ctx.sketchFile(picked)}`
    )
  }
  const state = await writeProgress(ctx, {
    ...record,
    chose: { name: picked, why: String(why).trim(), by, at: now() }
  })
  return { action: 'chose', slug: ctx.slug, state }
}

/** The verdict and fixes of an art director's reply (see `--round`). */
export function parseReview(text, { ship = false } = {}) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const first = /^(ship|revise)\b/i.exec(lines[0] ?? '')
  const verdictGiven = Boolean(first)
  const body = verdictGiven ? lines.slice(1) : lines
  const fixes = body
    .map((line) => line.replace(/^(?:\d{1,2}[.)]|[-*•])\s+/, '').trim())
    .filter(Boolean)
  return {
    verdict: ship || first?.[1].toLowerCase() === 'ship' ? 'ship' : 'revise',
    verdictGiven,
    fixes: fixes.slice(0, MAX_FIXES),
    cut: Math.max(0, fixes.length - MAX_FIXES)
  }
}

/** `--round K --fixes`: records the art director's reply for round K, replacing an earlier one. */
export async function recordRound(ctx, round, text, { ship = false } = {}) {
  const record = await requireProgress(ctx)
  if (!Number.isInteger(round) || round < 1 || round > record.rounds) {
    throw new HarnessError('invalid_argument', `--round must be 1 to ${String(record.rounds)}`)
  }
  if (round > record.reviews.length + 1) {
    throw new HarnessError(
      'invalid_argument',
      `Record round ${String(record.reviews.length + 1)} before round ${String(round)}`
    )
  }
  const parsed = parseReview(text, { ship })
  const review = { round, verdict: parsed.verdict, fixes: parsed.fixes, at: now() }
  const reviews = [...record.reviews.filter((entry) => entry.round !== round), review].toSorted(
    (first, second) => first.round - second.round
  )
  const state = await writeProgress(ctx, { ...record, reviews })
  return {
    action: 'round',
    slug: ctx.slug,
    round,
    review,
    last: round >= record.rounds,
    verdictGiven: parsed.verdictGiven,
    cut: parsed.cut,
    state
  }
}

/** `--done "note"`. */
export async function recordDone(ctx, note) {
  const record = await requireProgress(ctx)
  const state = await writeProgress(ctx, {
    ...record,
    done: { note: String(note).trim(), at: now() }
  })
  return { action: 'done', slug: ctx.slug, state }
}

/** `--want-critic`: asks Aster for a new art director chat (the old one has ended). */
export async function wantCritic(ctx) {
  const record = await requireProgress(ctx)
  const state = await writeProgress(ctx, { ...record, wantCritic: now() })
  return { action: 'want-critic', slug: ctx.slug, state }
}

/** The state with each sketch's file and whether it exists, and the art director so far. */
export async function carefulState(ctx) {
  const state = await readProgress(ctx)
  const critic = await readCritic(ctx)
  const sketches = await Promise.all(
    (state?.sketches ?? []).map(async (sketch) => ({
      ...sketch,
      file: ctx.sketchFile(sketch.name),
      exists: await exists(ctx.sketchFile(sketch.name))
    }))
  )
  return { action: 'state', slug: ctx.slug, started: state !== null, state, sketches, critic }
}

/** The page frame's size and design brief, read from the scene (null when it does not open). */
async function pageAndBrief(ctx) {
  let scene
  try {
    scene = JSON.parse(await readFile(ctx.scene, 'utf8'))
  } catch {
    return { page: null, brief: null }
  }
  const elements = Array.isArray(scene.elements) ? scene.elements : []
  const frame = designFrame(elements)
  const brief = frame?.customData?.asterDesign?.brief ?? frame?.customData?.asterPage?.design?.brief
  return {
    page: figurePage(elements),
    brief: typeof brief === 'string' && brief.trim() ? brief.trim() : null
  }
}

/** The reference the design brief says it follows ("Following <id>: …"), with its image. */
async function followedReference(project, brief, libraryDirectory) {
  const ids = [...String(brief ?? '').matchAll(/Following\s+([A-Za-z0-9_-]+)/g)].map(
    (match) => match[1]
  )
  if (!ids.length) {
    return null
  }
  const library = await referenceLibrary(project, libraryDirectory)
  const known = new Set(RECIPES.map((recipe) => recipe.id))
  const found = ids.map((id) => ({ id, image: referenceImage(library, id) }))
  return found.find((entry) => entry.image || known.has(entry.id)) ?? found[0]
}

/** Where the renders are, and whether each is missing or older than the figure file. */
async function renderFiles(ctx) {
  const files = figurePreviewPaths(projectLayout(ctx.project).root, ctx.slug)
  const sidecar = await readJson(path.join(ctx.project, files.sidecar))
  const scene = await readFile(ctx.scene).catch(() => null)
  const current = scene && sidecar?.sceneSha256 === sha256(scene)
  const describe = async (file) => {
    if (!(await exists(file))) {
      return { file, note: ' (missing: run figures preview first)' }
    }
    return { file, note: current ? '' : ' (older than the figure file: run figures preview first)' }
  }
  const print = typeof sidecar?.print === 'string' ? sidecar.print : files.print
  return {
    print: await describe(path.join(ctx.project, print)),
    full: await describe(path.join(ctx.project, files.png))
  }
}

/** The request to the art director for one round, as the file `aster orchestration send` reads. */
async function reviewBody(ctx, record, round, libraryDirectory) {
  const { page, brief } = await pageAndBrief(ctx)
  const renders = await renderFiles(ctx)
  const reference = await followedReference(ctx.project, brief, libraryDirectory)
  const previous = record.reviews.find((entry) => entry.round === round - 1)
  const lines = [
    `Art director review: figure ${ctx.slug}, round ${String(round)} of ${String(record.rounds)}.`,
    `Print-size render: ${renders.print.file}${renders.print.note}`,
    `Full render: ${renders.full.file}${renders.full.note}`,
    `Page: ${page ? `${String(page.widthIn)} × ${String(page.heightIn)} in` : 'unknown'}`,
    `Design brief: ${brief ?? 'none'}`,
    reference
      ? `Reference followed: ${reference.id}, ${reference.image ? `image: ${reference.image}` : '(no image here)'}`
      : 'No reference named in the design brief.'
  ]
  if (record.chose) {
    lines.push(
      `Sketch chosen: ${record.chose.name}${record.chose.why ? ` (${record.chose.why})` : ''}`
    )
  }
  if (previous?.fixes.length) {
    lines.push(
      "Last round's fixes (check they were made):",
      ...previous.fixes.map((fix) => `- ${fix}`)
    )
  }
  lines.push(
    '',
    FIGURE_ART_DIRECTOR_RULE,
    '',
    'Reply with aster orchestration reply --id <message_id> --body "<SHIP or REVISE, then the fixes, one per line>" (the id aster orchestration check shows you). Do not edit any file.'
  )
  return { text: `${lines.join('\n')}\n`, renders }
}

/**
 * `--review`: with no art director yet, asks Aster for one (wantCritic) and says to retry;
 * with one, writes this round's request file and returns what to send.
 */
export async function requestReview(ctx, { library = null } = {}) {
  const record = await requireProgress(ctx)
  const critic = await readCritic(ctx)
  const base = { action: 'review', slug: ctx.slug, rounds: record.rounds }
  if (!critic || criticIsStale(critic, record)) {
    const state = critic ? record : await writeProgress(ctx, { ...record, wantCritic: now() })
    return { ...base, status: 'waiting-for-critic', ended: Boolean(critic), state }
  }
  const round = record.reviews.length + 1
  if (record.reviews.at(-1)?.verdict === 'ship') {
    return { ...base, status: 'shipped', round: record.reviews.length, state: record }
  }
  if (round > record.rounds) {
    return { ...base, status: 'rounds-done', round: record.reviews.length, state: record }
  }
  const { text, renders } = await reviewBody(ctx, record, round, library)
  await ensureFolders(ctx)
  const bodyFile = ctx.bodyFile(round)
  await writeFile(bodyFile, text)
  return {
    ...base,
    status: 'ready',
    round,
    address: critic.address,
    agent: critic.agent ?? null,
    bodyFile,
    subject: `Figure ${ctx.slug}: round ${String(round)} of ${String(record.rounds)}`,
    warnings: [renders.print, renders.full]
      .filter((entry) => entry.note)
      .map((entry) => `${entry.file}${entry.note}`),
    state: record
  }
}
