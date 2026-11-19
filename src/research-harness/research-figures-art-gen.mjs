// `figures art`: the generated parts of a hybrid figure. Each part is one textless illustration an
// image model draws on white from the agent's prompt (Codex's built-in image generation, run as
// `codex exec`), or an image the agent made with its own image tool; prepared (keyed, trimmed,
// optionally split, a grid copy) beside the figure, at most ART_CAP generations per figure.
//
//   F/art/<slug>/<part>.prompt.txt   what to draw (the agent writes it; committed with the figure)
//   F/art/<slug>/<part>.raw.png      the image as generated
//   F/art/<slug>/<part>.png          keyed and trimmed (<part>-1.png … when split), placed by fig.art
//   F/art/<slug>/<part>.grid.png     the same on a checkerboard with tenths marked, to read anchors
//   F/art/<slug>/art.json            the generations so far (the cap counts them)
//   F/art/<slug>/.codex/             Codex's working folders, kept out of Git
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ART_CAP, prepareArt } from './research-figures-art.mjs'
import { listFigures } from './research-figures-folders.mjs'
import { HarnessError } from './research-harness-error.mjs'

const PART = /^[a-z0-9][a-z0-9-]*$/
/** A generation that has not answered in this long has hung. */
const CODEX_TIMEOUT_MS = 6 * 60 * 1000

const readJson = (file) =>
  readFile(file, 'utf8').then(
    (text) => JSON.parse(text),
    () => null
  )

/** The figure's art folder, from `listFigures` (an unknown slug is not_found). */
export async function artContext(project, slug) {
  const { figures } = await listFigures(project)
  const figure = figures.find((entry) => entry.slug === slug)
  if (!figure) {
    throw new HarnessError('not_found', `No figure ${slug}`)
  }
  const folder = path.join(path.dirname(path.join(project, figure.scene)), 'art', slug)
  return {
    project,
    slug,
    folder,
    record: path.join(folder, 'art.json'),
    file: (part, suffix) => path.join(folder, `${part}${suffix}`)
  }
}

export function checkPart(part) {
  if (!PART.test(String(part ?? ''))) {
    throw new HarnessError(
      'invalid_argument',
      `--part is a short name of lowercase letters, digits and dashes (camera, volumes), not ${JSON.stringify(part)}`
    )
  }
  return part
}

async function readRecord(ctx) {
  const record = await readJson(ctx.record)
  return record?.version === 1 && Array.isArray(record.generations)
    ? record
    : { version: 1, generations: [] }
}

/** The size Codex draws at for a slot of this aspect (width / height). */
export function artSize(aspect) {
  const text = String(aspect ?? '1')
  const [w, h] =
    text.includes('/') || text.includes(':') ? text.split(/[/:]/).map(Number) : [Number(text), 1]
  const value = w / h
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new HarnessError('invalid_argument', `--aspect is width/height (3/2, 1.5), not ${text}`)
  }
  return value >= 1.25
    ? { size: '1536x1024', shape: 'landscape' }
    : value <= 0.8
      ? { size: '1024x1536', shape: 'portrait' }
      : { size: '1024x1024', shape: 'square' }
}

/** The whole request to the image model: the textless contract around the agent's description. */
export function artPrompt(description, aspect) {
  const { size, shape } = artSize(aspect)
  return [
    `Create ONE image with your built-in image generation tool (exactly one image generation call, no retries), ${shape} (${size}).`,
    'It is ONE illustrative part of a machine-learning paper figure. A designer places it in the figure and adds every word, symbol, number and arrow as vector text afterwards, so the image itself contains NO text of any kind: no letters, no numbers, no math symbols, no labels, no captions, no arrows, no logos, no watermark, no user-interface elements.',
    'Background: plain pure white (#FFFFFF), flat; no floor line, horizon, vignette, frame or border. Keep everything fully inside the image with a clear white margin on every side.',
    '',
    'WHAT TO DRAW:',
    String(description).trim(),
    '',
    'Never reproduce a published paper figure; draw only the parts described above.',
    'After generating, copy the image file from where the tool saved it to ./art.png in the current directory. Run no other commands. Reply with the saved path.',
    ''
  ].join('\n')
}

function runCodex(args, input, cwd) {
  const command = process.env.ASTER_CODEX_COMMAND || 'codex'
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), CODEX_TIMEOUT_MS)
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: `${stderr}${error.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
    child.stdin.end(input)
  })
}

/** The image Codex saved: ./art.png, else the newest in its generated_images folder for the thread. */
async function generatedImage(dir, stdout) {
  if (existsSync(path.join(dir, 'art.png'))) {
    return path.join(dir, 'art.png')
  }
  const thread = stdout
    .split('\n')
    .map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return null
      }
    })
    .find((event) => event?.type === 'thread.started')?.thread_id
  if (!thread) {
    return null
  }
  const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
  const folder = path.join(home, 'generated_images', thread)
  const names = await readdir(folder).catch(() => [])
  const files = await Promise.all(
    names.map(async (name) => ({
      file: path.join(folder, name),
      at: (await stat(path.join(folder, name))).mtimeMs
    }))
  )
  return files.toSorted((a, b) => b.at - a.at)[0]?.file ?? null
}

/** Keys, trims (and splits) <part>.raw.png into <part>.png and its grid; returns the files. */
export async function prepareArtPart(ctx, part, { soft = false, split = false } = {}) {
  const raw = ctx.file(part, '.raw.png')
  let prepared
  try {
    prepared = prepareArt(await readFile(raw), { soft, split })
  } catch (error) {
    throw new HarnessError('invalid_argument', `${raw}: ${error.message}`)
  }
  const many = split
  const files = []
  for (const [index, piece] of prepared.pieces.entries()) {
    const name = many ? `${part}-${String(index + 1)}` : part
    await writeFile(ctx.file(name, '.png'), piece.png)
    await writeFile(ctx.file(name, '.grid.png'), piece.grid)
    files.push({
      part: name,
      png: ctx.file(name, '.png'),
      grid: ctx.file(name, '.grid.png'),
      width: piece.width,
      height: piece.height
    })
  }
  return { keyed: prepared.keyed, touchesEdge: prepared.touchesEdge, files }
}

/** `--from PNG`: an image the agent made itself (its own image tool), prepared like a generated one. */
export async function addArt(ctx, part, from, options) {
  await mkdir(ctx.folder, { recursive: true })
  await copyFile(path.resolve(from), ctx.file(part, '.raw.png'))
  return { action: 'add', slug: ctx.slug, part, ...(await prepareArtPart(ctx, part, options)) }
}

/** `--gen`: one generation from <part>.prompt.txt through `codex exec`, then prepared. */
export async function generateArt(ctx, part, { aspect, refs = [], model = null, soft, split }) {
  const description = await readFile(ctx.file(part, '.prompt.txt'), 'utf8').catch(() => null)
  if (!description?.trim()) {
    throw new HarnessError(
      'invalid_argument',
      `Write what to draw first: ${ctx.file(part, '.prompt.txt')}`
    )
  }
  const record = await readRecord(ctx)
  if (record.generations.length >= ART_CAP) {
    throw new HarnessError(
      'invalid_argument',
      `${ctx.slug} has used all ${String(ART_CAP)} generated images; place what you have, draw the rest with the kit, or prepare an image again with --prep`
    )
  }
  const images = refs.map((ref) => {
    const file = path.resolve(ctx.project, ref)
    if (!file.startsWith(`${ctx.project}${path.sep}`) || !existsSync(file)) {
      throw new HarnessError(
        'invalid_argument',
        `--ref takes a picture of this project (data/<figure>/x.png), not ${ref}`
      )
    }
    return file
  })
  const attempt = record.generations.length + 1
  const dir = path.join(ctx.folder, '.codex', `${part}-${String(attempt)}`)
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(ctx.folder, '.codex', '.gitignore'), '*\n')
  const prompt = artPrompt(description, aspect)
  await writeFile(path.join(dir, 'prompt.txt'), prompt)
  const started = Date.now()
  const run = await runCodex(
    [
      'exec',
      '--enable',
      'image_generation',
      '--skip-git-repo-check',
      '-s',
      'workspace-write',
      '-C',
      dir,
      '-c',
      'sandbox_workspace_write.exclude_slash_tmp=true',
      '-c',
      'sandbox_workspace_write.exclude_tmpdir_env_var=true',
      '--json',
      ...(model ? ['-m', model] : []),
      ...images.flatMap((image) => ['-i', image]),
      '-'
    ],
    prompt,
    dir
  )
  const seconds = Math.round((Date.now() - started) / 1000)
  const image = await generatedImage(dir, run.stdout)
  if (!image) {
    const said = `${run.stderr}`.trim().split('\n').slice(-3).join(' ')
    throw new HarnessError(
      'failed',
      `Codex made no image for ${part} (exit ${String(run.code)}, ${String(seconds)} s)${said ? `: ${said}` : ''}. When Codex says its model cannot be used, run again with --model <a model your Codex login serves>; without image generation, draw this part with the kit.`
    )
  }
  await copyFile(image, ctx.file(part, '.raw.png'))
  const generations = [...record.generations, { part, at: new Date().toISOString(), seconds }]
  await writeFile(ctx.record, `${JSON.stringify({ ...record, generations }, null, 2)}\n`)
  const prepared = await prepareArtPart(ctx, part, { soft, split })
  return {
    action: 'gen',
    slug: ctx.slug,
    part,
    seconds,
    used: generations.length,
    cap: ART_CAP,
    ...prepared
  }
}

/** Alone: the parts with their prompt and files, and how many generations are left. */
export async function artState(ctx) {
  const record = await readRecord(ctx)
  const names = await readdir(ctx.folder).catch(() => [])
  const parts = names
    .filter(
      (name) => name.endsWith('.png') && !name.endsWith('.grid.png') && !name.endsWith('.raw.png')
    )
    .map((name) => name.slice(0, -4))
    .toSorted()
  return {
    action: 'state',
    slug: ctx.slug,
    folder: ctx.folder,
    used: record.generations.length,
    cap: ART_CAP,
    parts
  }
}
