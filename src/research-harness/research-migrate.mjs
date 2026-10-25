import {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rmdir,
  writeFile
} from 'node:fs/promises'
import path from 'node:path'
import { initialAsterCatalog, readCatalog } from './research-catalog.mjs'
import { gitMovePath, gitTracksPath } from './research-code-capture.mjs'
import { writeJsonAtomically } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { ASTER_DIRECTORY, ASTER_GITIGNORE, LEGACY_RESEARCH_DIRECTORY } from './research-layout.mjs'

const LEGACY = LEGACY_RESEARCH_DIRECTORY
const MAX_TEX_FILES = 500
const MAX_TEX_BYTES = 10 * 1024 * 1024
const TEX_EXTENSIONS = new Set(['.tex', '.sty', '.cls', '.bib'])

function absolute(project, relative) {
  return path.join(project, ...relative.split('/'))
}

async function entryKind(target) {
  const details = await lstat(target).catch(() => null)
  if (!details) {
    return null
  }
  if (details.isSymbolicLink()) {
    return 'symlink'
  }
  return details.isDirectory() ? 'directory' : details.isFile() ? 'file' : 'other'
}

function isInside(relative, folder) {
  return relative === folder || relative.startsWith(`${folder}/`)
}

/** `--paper-dir` as a clean project-relative folder outside both record trees. */
function checkedPaperDirectory(value) {
  const normalized = typeof value === 'string' ? path.posix.normalize(value.trim()) : ''
  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('/') ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('\\') ||
    isInside(normalized, LEGACY) ||
    isInside(normalized, ASTER_DIRECTORY)
  ) {
    throw new HarnessError(
      'invalid_argument',
      `--paper-dir must be a folder inside the project, outside ${LEGACY}/ and ${ASTER_DIRECTORY}/`
    )
  }
  return normalized.replace(/\/+$/u, '')
}

/** Where a legacy project-relative path goes, or null when it stays (it is outside research/). */
function destinationOf(relative, paperDirectory, bibliographyName) {
  if (typeof relative !== 'string') {
    return null
  }
  const map = [
    [`${LEGACY}/manuscript`, paperDirectory],
    [`${LEGACY}/references/papers`, `${ASTER_DIRECTORY}/library/papers`],
    [`${LEGACY}/references/${bibliographyName}`, `${paperDirectory}/${bibliographyName}`],
    [`${LEGACY}/experiments`, `${ASTER_DIRECTORY}/experiments`],
    [`${LEGACY}/claims.json`, `${ASTER_DIRECTORY}/claims.json`]
  ]
  for (const [from, to] of map) {
    if (isInside(relative, from)) {
      return `${to}${relative.slice(from.length)}`
    }
  }
  return null
}

/**
 * Rewrites relative references in TeX sources that pointed from research/manuscript/ into the old
 * tree (`\bibliography{../references/library}`, figures under `../experiments/...`).
 */
function rewriteTexReferences(text, paperDirectory, bibliographyName) {
  const fromPaper = (target) => path.posix.relative(paperDirectory, target)
  const bibliographyStem = bibliographyName.replace(/\.bib$/u, '')
  const replacements = [
    [`../references/${bibliographyName}`, bibliographyName],
    [`../references/${bibliographyStem}`, bibliographyStem],
    ['../references/papers/', `${fromPaper(`${ASTER_DIRECTORY}/library/papers`)}/`],
    ['../experiments/', `${fromPaper(`${ASTER_DIRECTORY}/experiments`)}/`]
  ]
  let count = 0
  let next = text
  for (const [from, to] of replacements) {
    // Only inside a TeX argument: right after `{` or `,`, optionally after spaces.
    const pattern = new RegExp(`([{,]\\s*)${from.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&')}`, 'gu')
    next = next.replace(pattern, (_match, lead) => {
      count += 1
      return `${lead}${to}`
    })
  }
  return { text: next, count }
}

async function texFiles(root, found = [], depth = 0) {
  if (depth > 8 || found.length >= MAX_TEX_FILES) {
    return found
  }
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) {
      await texFiles(target, found, depth + 1)
    } else if (entry.isFile() && TEX_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      found.push(target)
    }
  }
  return found
}

async function checkedLegacyRuns(project, catalog) {
  const problems = []
  const missingExperimentFiles = []
  for (const experiment of catalog.experiments) {
    const folder = absolute(project, `${LEGACY}/experiments/${experiment.slug}`)
    if ((await entryKind(path.join(folder, 'experiment.json'))) !== 'file') {
      missingExperimentFiles.push(experiment)
    }
    for (const run of experiment.runs ?? []) {
      const manifest = path.join(folder, 'runs', run.id, 'run.json')
      const parsed = await readFile(manifest, 'utf8')
        .then((text) => JSON.parse(text))
        .catch(() => null)
      if (parsed?.externalRunId !== run.id) {
        problems.push(`${experiment.slug}/${run.id}: run.json is missing or names another Run`)
      }
    }
  }
  return { problems, missingExperimentFiles }
}

/**
 * Moves a pre-ADR-004 `research/` tree to `.aster/` and the manuscript to `paper/` (ADR-004).
 * Everything is moved, never copied or deleted: the old catalog is kept as
 * `.aster/local/research-project.v1.json`, and files the move does not know stay in `research/`.
 * With `dryRun` nothing changes and the plan is returned.
 */
export async function migrateProjectLayout(projectPath, options = {}) {
  const project = await realpath(projectPath)
  const dryRun = Boolean(options.dryRun)
  const paperDirectory = checkedPaperDirectory(options.paperDirectory ?? 'paper')
  if (await entryKind(absolute(project, `${ASTER_DIRECTORY}/project.json`))) {
    throw new HarnessError(
      'already_exists',
      `${ASTER_DIRECTORY}/project.json already exists; this project is already migrated`
    )
  }
  if ((await entryKind(path.join(project, LEGACY))) !== 'directory') {
    throw new HarnessError('project_not_found', `No ${LEGACY}/ folder to migrate in ${project}`)
  }
  if ((await entryKind(absolute(project, `${LEGACY}/project.json`))) !== 'file') {
    throw new HarnessError('project_not_found', `No ${LEGACY}/project.json in ${project}`)
  }
  const catalog = await readCatalog(project)
  const { problems, missingExperimentFiles } = await checkedLegacyRuns(project, catalog)
  if (problems.length) {
    throw new HarnessError(
      'invalid_layout',
      `Fix these Runs before migrating (validate shows details): ${problems.slice(0, 5).join('; ')}`
    )
  }
  const bibliographyName = path.posix.basename(
    catalog.references?.bibliography ?? `${LEGACY}/references/library.bib`
  )
  const moves = [
    [`${LEGACY}/experiments`, `${ASTER_DIRECTORY}/experiments`],
    [`${LEGACY}/claims.json`, `${ASTER_DIRECTORY}/claims.json`],
    [`${LEGACY}/manuscript`, paperDirectory],
    [`${LEGACY}/references/${bibliographyName}`, `${paperDirectory}/${bibliographyName}`],
    [`${LEGACY}/references/papers`, `${ASTER_DIRECTORY}/library/papers`],
    [`${LEGACY}/references/library.json`, `${ASTER_DIRECTORY}/library/library.json`],
    [`${LEGACY}/references/annotations.jsonl`, `${ASTER_DIRECTORY}/library/annotations.jsonl`],
    [`${LEGACY}/${ASTER_DIRECTORY}`, `${ASTER_DIRECTORY}/local`],
    [`${LEGACY}/project.json`, `${ASTER_DIRECTORY}/local/research-project.v1.json`]
  ]
  const planned = []
  for (const [from, to] of moves) {
    const kind = await entryKind(absolute(project, from))
    if (!kind) {
      continue
    }
    if (kind === 'symlink' || kind === 'other') {
      throw new HarnessError('invalid_layout', `${from} is not a regular file or folder`)
    }
    // Why: research/.aster/ becomes .aster/local/, which the backup of project.json also enters.
    const isBackup = to.startsWith(`${ASTER_DIRECTORY}/local/`)
    if (!isBackup && (await entryKind(absolute(project, to)))) {
      throw new HarnessError('already_exists', `${to} already exists; move or rename it first`)
    }
    planned.push({ from, to, kind })
  }
  const nextCatalog = {
    ...initialAsterCatalog,
    manuscript: {
      source:
        destinationOf(catalog.manuscript?.source, paperDirectory, bibliographyName) ??
        catalog.manuscript?.source ??
        `${paperDirectory}/main.tex`,
      pdf:
        catalog.manuscript?.pdf === null
          ? null
          : (destinationOf(catalog.manuscript?.pdf, paperDirectory, bibliographyName) ??
            catalog.manuscript?.pdf ??
            `${paperDirectory}/main.pdf`)
    },
    references: {
      bibliography:
        destinationOf(catalog.references?.bibliography, paperDirectory, bibliographyName) ??
        catalog.references?.bibliography ??
        `${paperDirectory}/${bibliographyName}`,
      papers:
        destinationOf(catalog.references?.papers, paperDirectory, bibliographyName) ??
        catalog.references?.papers ??
        `${ASTER_DIRECTORY}/library/papers`
    }
  }
  const created = missingExperimentFiles.map(
    (experiment) => `${ASTER_DIRECTORY}/experiments/${experiment.slug}/experiment.json`
  )
  if (dryRun) {
    return {
      project,
      dryRun,
      moved: planned,
      created,
      rewritten: [],
      leftovers: [],
      catalog: nextCatalog
    }
  }

  for (const move of planned) {
    await mkdir(path.dirname(absolute(project, move.to)), { recursive: true })
    // Why git mv: a tracked file moved by rename would show as deleted, and `git add` skips it
    // when .aster/.gitignore covers its new folder (Run artifacts). Per-machine state and the old
    // catalog's backup go to the ignored .aster/local/ by plain rename.
    if (!move.to.startsWith(`${ASTER_DIRECTORY}/local`) && gitTracksPath(project, move.from)) {
      const failure = gitMovePath(project, move.from, move.to)
      if (failure) {
        throw new HarnessError(
          'invalid_layout',
          `git mv ${move.from} ${move.to} failed: ${failure}`
        )
      }
      move.git = true
    } else {
      await rename(absolute(project, move.from), absolute(project, move.to))
    }
  }
  for (const experiment of missingExperimentFiles) {
    await writeFile(
      absolute(project, `${ASTER_DIRECTORY}/experiments/${experiment.slug}/experiment.json`),
      `${JSON.stringify({ schemaVersion: 1, slug: experiment.slug, name: experiment.name, createdAt: new Date().toISOString() }, null, 2)}\n`,
      { flag: 'wx' }
    )
  }
  await mkdir(path.join(project, ASTER_DIRECTORY, 'library', 'papers'), { recursive: true })
  await writeFile(path.join(project, ASTER_DIRECTORY, '.gitignore'), ASTER_GITIGNORE, {
    flag: 'wx'
  }).catch((error) => {
    if (error?.code !== 'EEXIST') {
      throw error
    }
  })

  const rewritten = []
  if (planned.some((move) => move.from === `${LEGACY}/manuscript`)) {
    for (const file of await texFiles(absolute(project, paperDirectory))) {
      const details = await lstat(file)
      if (details.size > MAX_TEX_BYTES) {
        continue
      }
      const text = await readFile(file, 'utf8')
      const result = rewriteTexReferences(text, paperDirectory, bibliographyName)
      if (result.count) {
        await writeFile(file, result.text)
        rewritten.push({
          file: path.relative(project, file).split(path.sep).join('/'),
          count: result.count
        })
      }
    }
  }

  const claimsFile = absolute(project, `${ASTER_DIRECTORY}/claims.json`)
  if ((await entryKind(claimsFile)) === 'file') {
    const ledger = JSON.parse(await readFile(claimsFile, 'utf8'))
    let changed = 0
    for (const claim of ledger.claims ?? []) {
      const next = destinationOf(claim.manuscript?.file, paperDirectory, bibliographyName)
      if (next) {
        claim.manuscript.file = next
        changed += 1
      }
    }
    if (changed) {
      await writeJsonAtomically(claimsFile, ledger)
      rewritten.push({ file: `${ASTER_DIRECTORY}/claims.json`, count: changed })
    }
  }

  // Why last: the project switches to .aster only once everything it lists is in place.
  await writeJsonAtomically(absolute(project, `${ASTER_DIRECTORY}/project.json`), nextCatalog)
  for (const folder of [`${LEGACY}/references`, LEGACY]) {
    await rmdir(absolute(project, folder)).catch(() => {})
  }
  const leftovers = []
  async function collect(relative) {
    for (const entry of await readdir(absolute(project, relative), { withFileTypes: true }).catch(
      () => []
    )) {
      leftovers.push(`${relative}/${entry.name}${entry.isDirectory() ? '/' : ''}`)
    }
  }
  await collect(LEGACY)
  return { project, dryRun, moved: planned, created, rewritten, leftovers, catalog: nextCatalog }
}
