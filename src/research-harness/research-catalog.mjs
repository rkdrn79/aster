import { lstat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { withFileLock, writeJsonAtomically } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  ASTER_DIRECTORY,
  LEGACY_RESEARCH_DIRECTORY,
  projectLayout,
  safeExperimentSlug,
  safeIdentifier
} from './research-layout.mjs'

/** A pre-ADR-004 `research/project.json`, which lists every Experiment and Run. */
export const initialCatalog = {
  schemaVersion: 1,
  manuscript: {
    source: 'research/manuscript/main.tex',
    pdf: 'research/manuscript/main.pdf'
  },
  references: {
    bibliography: 'research/references/library.bib',
    papers: 'research/references/papers'
  },
  experiments: []
}

/**
 * `.aster/project.json` holds the path map only. Experiments and Runs come from their folders, so
 * Runs made on a laptop, a cluster and in worktrees merge in git without touching one shared list.
 */
export const initialAsterCatalog = {
  schemaVersion: 2,
  manuscript: { source: 'paper/main.tex', pdf: 'paper/main.pdf' },
  references: {
    bibliography: 'paper/references.bib',
    papers: `${ASTER_DIRECTORY}/library/papers`
  }
}

/** Keys of an `.aster` catalog that are rebuilt from the folders on every read. */
const DERIVED_KEYS = ['experiments', 'claims']
const MAX_CATALOG_BYTES = 10 * 1024 * 1024
const MAX_RECORD_BYTES = 1024 * 1024

export function catalogPath(project) {
  return path.join(project, projectLayout(project).root, 'project.json')
}

async function isRegularFile(target) {
  return lstat(target).then(
    (details) => details.isFile(),
    () => false
  )
}

// Why: agents run the CLI from anywhere inside a project, so --project is optional.
export async function resolveProjectRoot(explicitPath, cwd = process.cwd()) {
  if (explicitPath) {
    return path.resolve(cwd, explicitPath)
  }
  const start = path.resolve(cwd)
  let current = start
  for (;;) {
    for (const root of [ASTER_DIRECTORY, LEGACY_RESEARCH_DIRECTORY]) {
      if (await isRegularFile(path.join(current, root, 'project.json'))) {
        return current
      }
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return start
    }
    current = parent
  }
}

async function readStoredCatalog(project) {
  const layout = projectLayout(project)
  const relative = `${layout.root}/project.json`
  const target = catalogPath(project)
  const details = await lstat(target).catch((error) => {
    if (error?.code === 'ENOENT') {
      throw new HarnessError(
        'project_not_found',
        `No ${ASTER_DIRECTORY}/project.json in ${project} or its parents; run init there or pass --project`
      )
    }
    throw error
  })
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`${relative} must be a regular file`)
  }
  if (details.size > MAX_CATALOG_BYTES) {
    throw new Error(`${relative} exceeds the 10 MiB catalog limit`)
  }
  const catalog = JSON.parse(await readFile(target, 'utf8'))
  const supported =
    layout.kind === 'aster'
      ? catalog?.schemaVersion === 2
      : catalog?.schemaVersion === 1 && Array.isArray(catalog.experiments)
  if (!supported) {
    throw new Error(`Unsupported ${relative} schema; refusing to rewrite it`)
  }
  return { layout, catalog }
}

async function readRecord(target) {
  const details = await lstat(target).catch(() => null)
  if (!details?.isFile() || details.isSymbolicLink()) {
    return { error: 'missing or not a regular file' }
  }
  if (details.size > MAX_RECORD_BYTES) {
    return { error: 'larger than 1 MiB' }
  }
  try {
    const value = JSON.parse(await readFile(target, 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { value }
      : { error: 'not a JSON object' }
  } catch (error) {
    return { error: `invalid JSON: ${error.message}` }
  }
}

async function subdirectories(target) {
  const entries = await readdir(target, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  })
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
}

function byCreation(left, right) {
  return left.createdAt.localeCompare(right.createdAt) || left.key.localeCompare(right.key)
}

function passes(check) {
  try {
    check()
    return true
  } catch {
    return false
  }
}

// Why '9999': a record without a creation time sorts after the dated ones instead of first.
function creationTime(value) {
  return typeof value === 'string' && value ? value : '9999'
}

async function scanRuns(experimentRoot, relative, skipped) {
  const runs = []
  for (const id of await subdirectories(path.join(experimentRoot, 'runs'))) {
    const runRelative = `${relative}/runs/${id}`
    if (!passes(() => safeIdentifier(id, 'Run ID'))) {
      skipped.push({ path: runRelative, reason: 'folder name is not a Run ID' })
      continue
    }
    const runDirectory = path.join(experimentRoot, 'runs', id)
    const manifest = await readRecord(path.join(runDirectory, 'run.json'))
    if (manifest.error || manifest.value.externalRunId !== id) {
      skipped.push({
        path: `${runRelative}/run.json`,
        reason: manifest.error ?? 'externalRunId does not match the folder'
      })
      continue
    }
    const name = manifest.value.name
    runs.push({
      key: id,
      createdAt: creationTime(
        manifest.value.harness?.createdAt ?? manifest.value.launch?.startedAt
      ),
      entry: {
        id,
        name: typeof name === 'string' && name.trim() ? name : id,
        manifest: `${runRelative}/run.json`,
        metrics: `${runRelative}/metrics.jsonl`,
        log: `${runRelative}/train.log`,
        config: (await isRegularFile(path.join(runDirectory, 'config.json')))
          ? `${runRelative}/config.json`
          : null
      }
    })
  }
  return runs.sort(byCreation).map((run) => run.entry)
}

/**
 * Experiments and Runs of an `.aster` project, read from their folders in creation order.
 * `skipped` lists folders that are not (yet) a valid Experiment or Run, for `validate`.
 */
export async function scanCatalogExperiments(project) {
  const experimentsRoot = path.join(project, ASTER_DIRECTORY, 'experiments')
  const experiments = []
  const skipped = []
  for (const slug of await subdirectories(experimentsRoot)) {
    const relative = `${ASTER_DIRECTORY}/experiments/${slug}`
    if (!passes(() => safeExperimentSlug(slug))) {
      skipped.push({ path: relative, reason: 'folder name is not an Experiment slug' })
      continue
    }
    const metadata = await readRecord(path.join(experimentsRoot, slug, 'experiment.json'))
    if (metadata.error || metadata.value.slug !== slug || typeof metadata.value.name !== 'string') {
      skipped.push({
        path: `${relative}/experiment.json`,
        reason: metadata.error ?? 'slug or name does not match the folder'
      })
      continue
    }
    experiments.push({
      key: slug,
      createdAt: creationTime(metadata.value.createdAt),
      entry: {
        slug,
        name: metadata.value.name,
        path: relative,
        runs: await scanRuns(path.join(experimentsRoot, slug), relative, skipped)
      }
    })
  }
  return { experiments: experiments.sort(byCreation).map((item) => item.entry), skipped }
}

/**
 * The project's catalog in the version 1 shape every reader uses. For `.aster` projects the
 * Experiments and Runs are scanned and `claims` is set once the claims ledger exists.
 */
export async function readCatalog(project) {
  const { layout, catalog } = await readStoredCatalog(project)
  if (layout.kind !== 'aster') {
    return catalog
  }
  const claims = `${ASTER_DIRECTORY}/claims.json`
  const hasClaims = await isRegularFile(path.join(project, ASTER_DIRECTORY, 'claims.json'))
  return {
    ...catalog,
    ...(hasClaims ? { claims } : {}),
    experiments: (await scanCatalogExperiments(project)).experiments
  }
}

// Why: parallel loop workers create Runs at once, so a busy lock waits briefly instead of failing.
export async function updateCatalog(project, transform) {
  const target = catalogPath(project)
  await withFileLock(`${target}.lock`, async () => {
    const next = transform(await readCatalog(project))
    if (projectLayout(project).kind === 'aster') {
      for (const key of DERIVED_KEYS) {
        delete next[key]
      }
    }
    await writeJsonAtomically(target, next)
  })
}

function isInsidePath(relative, folder) {
  return relative === folder || relative.startsWith(`${folder}/`)
}

function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.includes('\\')) {
    return null
  }
  const normalized = path.posix.normalize(value)
  return normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../')
    ? null
    : normalized.replace(/\/+$/u, '')
}

/**
 * Project-relative paths that hold records, not code: the record tree, plus the manuscript folder
 * and bibliography when they sit outside it. The project root itself is never excluded.
 */
export async function recordPathsOutsideCode(project) {
  const layout = projectLayout(project)
  const excluded = [{ path: layout.root, directory: true }]
  const stored = await readStoredCatalog(project).catch(() => null)
  const source = safeRelative(stored?.catalog.manuscript?.source)
  const manuscriptFolder = source ? path.posix.dirname(source) : null
  if (
    manuscriptFolder &&
    manuscriptFolder !== '.' &&
    !isInsidePath(manuscriptFolder, layout.root)
  ) {
    excluded.push({ path: manuscriptFolder, directory: true })
  }
  const bibliography = safeRelative(stored?.catalog.references?.bibliography)
  if (
    bibliography &&
    !isInsidePath(bibliography, layout.root) &&
    !(manuscriptFolder && manuscriptFolder !== '.' && isInsidePath(bibliography, manuscriptFolder))
  ) {
    excluded.push({ path: bibliography, directory: false })
  }
  return excluded
}
