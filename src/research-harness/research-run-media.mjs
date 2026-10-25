import { lstat, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { withFileLock } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { appendLedgerEntry, readLedgerEntries } from './research-jsonl-ledger.mjs'
import { readRunOutputs } from './research-run-outputs.mjs'
import { resolveRunReference } from './research-run-manifest.mjs'

export const MEDIA_LINE_PREFIX = 'ASTER_MEDIA '
export const RUN_MEDIA_FILE = 'media.jsonl'
export const MEDIA_KINDS = ['image', 'video', 'audio']
const EXTENSION_KINDS = new Map([
  ...['png', 'jpg', 'jpeg', 'gif', 'webp'].map((extension) => [extension, 'image']),
  ...['mp4', 'm4v', 'mov', 'webm'].map((extension) => [extension, 'video']),
  ...['mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'flac', 'opus'].map((extension) => [
    extension,
    'audio'
  ])
])
const MAX_INDEX_ITEMS = 2000
/** How many outputs.jsonl media entries an index reads; repeated paths make it exceed the cap. */
export const OUTPUT_MEDIA_LIMIT = MAX_INDEX_ITEMS * 2
const FILLED_FIELDS = ['step', 'label', 'sampleId', 'bytes']
const MAX_SCAN_ENTRIES = 20_000
const MAX_SCAN_DEPTH = 8
const MAX_LABEL = 200
const MAX_SAMPLE_ID = 256
const MAX_PATH = 4096

/** image, video, or audio by file extension (plan C6), or null for anything else. */
export function mediaKindOfPath(file) {
  return EXTENSION_KINDS.get(path.extname(file).slice(1).toLowerCase()) ?? null
}

/** The declared kind, else the extension's; a file without a media extension is refused. */
export function checkedMediaKind(file, declared = null) {
  if (declared !== null && !MEDIA_KINDS.includes(declared)) {
    throw new HarnessError(
      'invalid_argument',
      `Media kind must be one of: ${MEDIA_KINDS.join(', ')}`
    )
  }
  const kind = mediaKindOfPath(file)
  if (!kind) {
    throw new HarnessError(
      'invalid_argument',
      `Not an image, video, or audio file extension: ${path.basename(file)}`
    )
  }
  return declared ?? kind
}

export function checkedMediaDetails({ step = null, label = null, sampleId = null }) {
  if (step !== null && (typeof step !== 'number' || !Number.isFinite(step))) {
    throw new HarnessError('invalid_argument', 'Media step must be a finite number')
  }
  for (const [value, name, max] of [
    [label, 'label', MAX_LABEL],
    [sampleId, 'sampleId', MAX_SAMPLE_ID]
  ]) {
    if (value !== null && (typeof value !== 'string' || !value.trim() || value.length > max)) {
      throw new HarnessError(
        'invalid_argument',
        `Media ${name} must be text of 1–${max} characters`
      )
    }
  }
  return { step, label: label?.trim() ?? null, sampleId: sampleId?.trim() ?? null }
}

export function isInsideProject(project, target) {
  const relative = path.relative(project, target)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

/** Project-relative `/` path of a file inside the project; files outside are never recorded. */
export function projectMediaPath(project, target) {
  if (!isInsideProject(project, target)) {
    throw new HarnessError('outside_project', `Media file is outside the project: ${target}`)
  }
  return path.relative(project, target).split(path.sep).join('/')
}

export function mediaRow({ kind, path: file, bytes, details, source }) {
  return {
    schemaVersion: 1,
    at: new Date().toISOString(),
    kind,
    path: file,
    step: details.step,
    label: details.label,
    sampleId: details.sampleId,
    bytes,
    source
  }
}

export async function appendRunMedia(runDirectory, row) {
  const target = path.join(runDirectory, RUN_MEDIA_FILE)
  await withFileLock(`${target}.lock`, () => appendLedgerEntry(target, row))
}

function mediaLinePayload(line) {
  let payload = null
  try {
    payload = JSON.parse(line.slice(MEDIA_LINE_PREFIX.length))
  } catch {
    // Reported below like any other malformed line.
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HarnessError('invalid_argument', 'expected ASTER_MEDIA {"path": ...}')
  }
  if (typeof payload.path !== 'string' || !payload.path.trim() || payload.path.length > MAX_PATH) {
    throw new HarnessError('invalid_argument', 'ASTER_MEDIA needs a "path"')
  }
  return payload
}

/**
 * The media.jsonl row for one `ASTER_MEDIA {"path",...}` line of a `run exec` command, whose
 * relative paths start at the command's `cwd`. Throws the reason a line is refused.
 */
export async function mediaRowFromLine(project, line, { cwd }) {
  const payload = mediaLinePayload(line)
  const details = checkedMediaDetails({
    step: payload.step ?? null,
    label: payload.label ?? null,
    sampleId: payload.sampleId ?? null
  })
  const actual = await realpath(path.resolve(cwd, payload.path)).catch(() => null)
  if (!actual) {
    throw new HarnessError('not_found', `no such file: ${payload.path}`)
  }
  const file = projectMediaPath(project, actual)
  const kind = checkedMediaKind(actual, payload.kind ?? null)
  const stats = await lstat(actual)
  if (!stats.isFile()) {
    throw new HarnessError('invalid_argument', `not a regular file: ${payload.path}`)
  }
  return mediaRow({ kind, path: file, bytes: stats.size, details, source: 'exec' })
}

function nullableNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function nullableText(value) {
  return typeof value === 'string' && value ? value : null
}

/** A stored project-relative path, or null when it would leave the project. */
function storedProjectPath(value) {
  if (typeof value !== 'string' || !value || value.length > MAX_PATH) {
    return null
  }
  const normalized = path.posix.normalize(value)
  return normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)
    ? null
    : normalized
}

async function recordedMedia(runDirectory) {
  const items = []
  for (const row of await readLedgerEntries(path.join(runDirectory, RUN_MEDIA_FILE))) {
    const file = storedProjectPath(row.path)
    if (file && MEDIA_KINDS.includes(row.kind)) {
      items.push({
        kind: row.kind,
        path: file,
        step: nullableNumber(row.step),
        label: nullableText(row.label),
        sampleId: nullableText(row.sampleId),
        bytes: nullableNumber(row.bytes),
        source: row.source === 'attach' ? 'attach' : 'exec'
      })
    }
  }
  return items
}

async function regularFileSize(target) {
  const actual = await realpath(target).catch(() => null)
  const stats = actual ? await lstat(actual).catch(() => null) : null
  return stats?.isFile() ? { actual, bytes: stats.size } : null
}

/**
 * Project path of an outputs.jsonl media entry. Plan C6 resolves it from the outputs file's
 * folder; Aster's sample views have resolved `imagePath` from the project, so an entry that only
 * exists there is found too.
 */
async function outputMediaPath(project, folder, file) {
  const candidates = path.isAbsolute(file)
    ? [file]
    : [path.resolve(folder, file), path.resolve(project, file)]
  for (const candidate of candidates) {
    const found = await regularFileSize(candidate)
    if (found && isInsideProject(project, found.actual)) {
      return { path: projectMediaPath(project, found.actual), bytes: found.bytes }
    }
  }
  return isInsideProject(project, candidates[0])
    ? { path: projectMediaPath(project, candidates[0]), bytes: null }
    : null
}

async function outputsMedia(project, runDirectory, outputs) {
  const items = []
  for (const entry of outputs?.media ?? []) {
    const kind = MEDIA_KINDS.includes(entry.kind) ? entry.kind : mediaKindOfPath(entry.path)
    const located = kind ? await outputMediaPath(project, runDirectory, entry.path) : null
    if (located) {
      items.push({
        kind,
        path: located.path,
        step: null,
        label: entry.label,
        sampleId: entry.sampleId,
        bytes: located.bytes,
        source: 'outputs'
      })
    }
  }
  return items
}

/** Media files under the Run's artifacts/, without following symlinks, in name order. */
async function scannedMedia(project, artifactsDirectory, limit) {
  const items = []
  let visited = 0
  let truncated = false
  const walk = async (directory, depth) => {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    for (const entry of entries) {
      if (items.length >= limit || visited >= MAX_SCAN_ENTRIES) {
        truncated = true
        return
      }
      visited += 1
      const target = path.join(directory, entry.name)
      const kind = entry.isFile() ? mediaKindOfPath(entry.name) : null
      if (entry.isDirectory() && depth < MAX_SCAN_DEPTH) {
        await walk(target, depth + 1)
      } else if (kind) {
        items.push({
          kind,
          path: projectMediaPath(project, target),
          step: null,
          label: null,
          sampleId: null,
          bytes: (await lstat(target).catch(() => null))?.size ?? null,
          source: 'scan'
        })
      }
    }
  }
  const root = await lstat(artifactsDirectory).catch(() => null)
  if (root?.isDirectory()) {
    await walk(artifactsDirectory, 1)
  }
  return { items, truncated }
}

/** One item per path: recorded rows first (the latest row of a path wins), then gaps filled. */
function mergedMedia(recorded, others) {
  const byPath = new Map()
  for (const item of recorded) {
    byPath.set(item.path, item)
  }
  for (const item of others) {
    const merged = { ...(byPath.get(item.path) ?? item) }
    for (const key of FILLED_FIELDS) {
      merged[key] ??= item[key]
    }
    byPath.set(item.path, merged)
  }
  return [...byPath.values()]
}

/**
 * The Run's media index (plan C6), built on read from media.jsonl, outputs.jsonl media, and media
 * files under artifacts/. `outputs` is a `readRunOutputs` result when the caller already read it.
 */
export async function runMediaIndex(project, run, { outputs } = {}) {
  const outputRows =
    outputs === undefined
      ? await readRunOutputs(run.paths.run, { mediaLimit: OUTPUT_MEDIA_LIMIT }).catch(() => null)
      : outputs
  const recorded = await recordedMedia(run.paths.run)
  const fromOutputs = await outputsMedia(project, run.paths.run, outputRows)
  const scan = await scannedMedia(project, run.paths.artifacts, MAX_INDEX_ITEMS * 2)
  const items = mergedMedia(recorded, [...fromOutputs, ...scan.items])
  return {
    run: run.ref,
    items: items.slice(0, MAX_INDEX_ITEMS),
    truncated:
      items.length > MAX_INDEX_ITEMS || scan.truncated || Boolean(outputRows?.mediaTruncated)
  }
}

export async function readRunMediaIndex(projectPath, reference) {
  const project = await realpath(projectPath)
  return runMediaIndex(project, await resolveRunReference(project, reference))
}
