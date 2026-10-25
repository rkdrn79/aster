import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  catalogPath,
  initialAsterCatalog,
  initialCatalog,
  readCatalog,
  updateCatalog
} from './research-catalog.mjs'
import { writeJsonAtomically } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { parseMetricDefinitions } from './research-metric-events.mjs'
import {
  ASTER_GITIGNORE,
  experimentPaths,
  experimentRelativePath,
  experimentSlug,
  libraryPaths,
  projectLayout,
  researchPaths,
  runPaths,
  runReference,
  runRelativePath,
  safeIdentifier
} from './research-layout.mjs'

const manuscriptTemplate = String.raw`\documentclass{article}
\usepackage[utf8]{inputenc}
\title{Untitled Research Manuscript}
\author{}
\date{}
\begin{document}
\maketitle
\begin{abstract}
\end{abstract}
\section{Introduction}
\end{document}
`

async function projectDirectory(projectPath) {
  const root = await realpath(projectPath)
  if (!(await stat(root)).isDirectory()) {
    throw new Error(`Project is not a directory: ${projectPath}`)
  }
  return root
}

async function ensureDirectory(target) {
  try {
    await mkdir(target)
    return 'created'
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error
    }
    const entry = await lstat(target)
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new Error(`Expected a real directory, not a file or symlink: ${target}`)
    }
    return 'existing'
  }
}

async function createFile(target, content) {
  try {
    await writeFile(target, content, { flag: 'wx' })
    return 'created'
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw error
    }
    const entry = await lstat(target)
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(`Expected a regular file, not a directory or symlink: ${target}`)
    }
    return 'existing'
  }
}

/** Creates each missing folder of a project-relative `/` path; refuses symlinks on the way. */
async function ensureProjectDirectory(project, relativeDirectory) {
  let status = 'existing'
  let current = project
  for (const part of relativeDirectory.split('/').filter((item) => item && item !== '.')) {
    current = path.join(current, part)
    status = await ensureDirectory(current)
  }
  return status
}

function insideProject(project, relativePath) {
  const target = path.resolve(project, ...relativePath.split('/'))
  const relative = path.relative(project, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new HarnessError('invalid_layout', `Catalog path leaves the project: ${relativePath}`)
  }
  return target
}

const PATH_OPTIONS = {
  manuscript: { extension: '.tex', label: '--manuscript' },
  pdf: { extension: '.pdf', label: '--pdf' },
  bibliography: { extension: '.bib', label: '--bibliography' },
  papers: { extension: null, label: '--papers' }
}

/** A user-given catalog path: project-relative with `/`, inside the project, outside the record tree. */
function checkedCatalogPath(project, key, value) {
  const { extension, label } = PATH_OPTIONS[key]
  const normalized = typeof value === 'string' ? path.posix.normalize(value.trim()) : ''
  const root = projectLayout(project).root
  if (
    !normalized ||
    normalized === '.' ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/u.test(normalized) ||
    normalized.includes('\\') ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    (key !== 'papers' && (normalized === root || normalized.startsWith(`${root}/`)))
  ) {
    throw new HarnessError(
      'invalid_argument',
      `${label} must be a path inside the project, relative to its root`
    )
  }
  if (extension && !normalized.toLowerCase().endsWith(extension)) {
    throw new HarnessError('invalid_argument', `${label} must name a ${extension} file`)
  }
  return normalized.replace(/\/+$/u, '')
}

/** Points the catalog at existing files, e.g. a LaTeX folder the user keeps outside `paper/`. */
async function applyCatalogPaths(project, paths) {
  const checked = Object.fromEntries(
    Object.entries(paths)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, checkedCatalogPath(project, key, value)])
  )
  if (!Object.keys(checked).length) {
    return
  }
  // Why: LaTeX writes the PDF beside its main file, so a moved manuscript moves the PDF too.
  if (checked.manuscript && !checked.pdf) {
    checked.pdf = checked.manuscript.replace(/\.tex$/iu, '.pdf')
  }
  await updateCatalog(project, (catalog) => ({
    ...catalog,
    manuscript: {
      ...catalog.manuscript,
      ...(checked.manuscript ? { source: checked.manuscript } : {}),
      ...(checked.pdf ? { pdf: checked.pdf } : {})
    },
    references: {
      ...catalog.references,
      ...(checked.bibliography ? { bibliography: checked.bibliography } : {}),
      ...(checked.papers ? { papers: checked.papers } : {})
    }
  }))
}

/**
 * Creates what is missing and keeps what exists. A project with `research/project.json` keeps its
 * pre-ADR-004 tree; any other project gets `.aster/`, with the manuscript in `paper/` (ADR-004).
 * The manuscript and bibliography are created where the catalog points, so a user who re-pointed
 * them at an existing LaTeX folder does not get a second paper.
 */
export async function initializeResearchProject(
  projectPath,
  catalogPaths = {},
  { createPaper = true } = {}
) {
  const project = await projectDirectory(projectPath)
  const layout = projectLayout(project)
  const paths = researchPaths(project)
  const status = {}
  status.root = await ensureDirectory(paths.root)
  status.experiments = await ensureDirectory(paths.experiments)
  if (layout.kind === 'aster') {
    status.gitignore = await createFile(path.join(paths.root, '.gitignore'), ASTER_GITIGNORE)
    await createFile(path.join(paths.experiments, '.gitkeep'), '')
  }
  status.catalog = await createFile(
    catalogPath(project),
    `${JSON.stringify(layout.kind === 'aster' ? initialAsterCatalog : initialCatalog, null, 2)}\n`
  )
  // Why before the files: init must not create a template paper/ next to the user's real paper.
  await applyCatalogPaths(project, catalogPaths)
  const catalog = await readCatalog(project)
  const files = {
    catalog: catalogPath(project),
    manuscriptSource: insideProject(project, catalog.manuscript?.source ?? layout.manuscriptSource),
    bibliography: insideProject(project, catalog.references?.bibliography ?? layout.bibliography),
    papers: insideProject(project, catalog.references?.papers ?? layout.papers)
  }
  // Why optional: the app creates the template paper only when the user asks for a manuscript.
  if (createPaper) {
    for (const target of [files.manuscriptSource, files.bibliography]) {
      await ensureProjectDirectory(
        project,
        path.relative(project, path.dirname(target)).split(path.sep).join('/')
      )
    }
    status.manuscriptSource = await createFile(files.manuscriptSource, manuscriptTemplate)
    status.bibliography = await createFile(files.bibliography, '')
  }
  status.referencePapers = await ensureProjectDirectory(
    project,
    path.relative(project, files.papers).split(path.sep).join('/')
  )
  if (layout.kind === 'aster') {
    status.library = await ensureDirectory(libraryPaths(project).root)
    if (files.papers === libraryPaths(project).papers) {
      await createFile(path.join(files.papers, '.gitkeep'), '')
    }
  }
  return { project, layout: layout.kind, paths, files, status }
}

export async function createExperiment(projectPath, name, { createPaper = true } = {}) {
  const project = await projectDirectory(projectPath)
  const slug = experimentSlug(name)
  await initializeResearchProject(project, {}, { createPaper })
  const paths = experimentPaths(project, slug)
  const directoryStatus = await ensureDirectory(paths.experiment)
  await ensureDirectory(paths.runs)
  await ensureDirectory(path.join(paths.experiment, 'analysis'))
  if (projectLayout(project).kind === 'aster') {
    await createFile(path.join(paths.runs, '.gitkeep'), '')
    await createFile(path.join(paths.experiment, 'analysis', '.gitkeep'), '')
  }
  const metadataPath = path.join(paths.experiment, 'experiment.json')
  const metadata = {
    schemaVersion: 1,
    slug,
    name: name.trim(),
    createdAt: new Date().toISOString()
  }
  const metadataStatus = await createFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
  if (metadataStatus === 'existing') {
    const existing = JSON.parse(await readFile(metadataPath, 'utf8'))
    if (existing.slug !== slug || existing.name !== metadata.name) {
      throw new Error(
        `Experiment folder ${slug} already belongs to ${existing.name ?? 'another experiment'}`
      )
    }
  }
  // Why: an .aster catalog lists Experiments from their folders; only the legacy tree indexes them.
  if (projectLayout(project).kind === 'legacy') {
    const relative = experimentRelativePath(project, slug)
    await updateCatalog(project, (catalog) => {
      const indexed = catalog.experiments.find((entry) => entry.slug === slug)
      if (indexed && (indexed.name !== metadata.name || indexed.path !== relative)) {
        throw new Error(`Catalog entry for ${slug} conflicts with the existing experiment`)
      }
      if (!indexed) {
        catalog.experiments.push({ slug, name: metadata.name, path: relative, runs: [] })
      }
      return catalog
    })
  }
  return { project, slug, paths, status: directoryStatus === 'created' ? 'created' : 'existing' }
}

async function configSource(project, selectedPath) {
  if (!selectedPath) {
    return null
  }
  const candidate = path.resolve(project, selectedPath)
  const actual = await realpath(candidate)
  const relative = path.relative(project, actual)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new HarnessError(
      'invalid_argument',
      'Config must resolve to a file inside the selected project'
    )
  }
  const details = await stat(actual)
  if (!details.isFile() || details.size > 1024 * 1024) {
    throw new HarnessError('invalid_argument', 'Config must be a JSON file of at most 1 MiB')
  }
  JSON.parse(await readFile(actual, 'utf8'))
  return actual
}

function checkedCapture(options) {
  const capturePhase = options.capturePhase ?? 'unknown'
  if (!['at_launch', 'at_attach', 'imported', 'unknown'].includes(capturePhase)) {
    throw new HarnessError(
      'invalid_argument',
      'Capture phase must be at_launch, at_attach, imported, or unknown'
    )
  }
  if (options.commit && !/^[a-f0-9]{40,64}$/iu.test(options.commit)) {
    throw new HarnessError('invalid_argument', 'Commit must be a 40–64 digit hexadecimal SHA')
  }
  if (
    options.capturedAt &&
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      options.capturedAt
    ) ||
      Number.isNaN(Date.parse(options.capturedAt)))
  ) {
    throw new HarnessError('invalid_argument', 'Captured-at must be an ISO timestamp')
  }
  if (capturePhase === 'at_launch' && (!options.commit || !options.capturedAt)) {
    throw new HarnessError(
      'invalid_argument',
      'Launch-time provenance requires both --commit and --captured-at'
    )
  }
  return { capturePhase, commit: options.commit ?? null, capturedAt: options.capturedAt ?? null }
}

/**
 * `launch` is set only by the harness's own launcher: it supplies observed code provenance,
 * launch/agent records, and files that must exist before run.json references them.
 */
export async function createRun(projectPath, options, launch = null) {
  const project = await projectDirectory(projectPath)
  const slug = experimentSlug(options.experiment)
  const experiment = experimentPaths(project, slug)
  await ensureDirectory(researchPaths(project).root)
  await ensureDirectory(researchPaths(project).experiments)
  const experimentDirectory = await lstat(experiment.experiment)
  if (!experimentDirectory.isDirectory() || experimentDirectory.isSymbolicLink()) {
    throw new Error('Experiment must be a real directory')
  }
  const metadataFile = await lstat(path.join(experiment.experiment, 'experiment.json'))
  if (!metadataFile.isFile() || metadataFile.isSymbolicLink()) {
    throw new Error('Experiment metadata must be a regular file')
  }
  const metadata = JSON.parse(
    await readFile(path.join(experiment.experiment, 'experiment.json'), 'utf8')
  )
  if (metadata.slug !== slug) {
    throw new Error('Experiment folder metadata does not match its name')
  }
  const name = options.name?.trim()
  if (!name || name.length > 120) {
    throw new HarnessError('invalid_argument', 'Run name must contain 1–120 characters')
  }
  const code = launch?.code ?? checkedCapture(options)
  const definitions = parseMetricDefinitions(options.metricDefinitions)
  if (
    (options.datasetRevision || options.split || options.evaluatorRevision) &&
    !options.datasetId
  ) {
    throw new HarnessError('invalid_argument', 'Evaluation details require --dataset-id')
  }
  const source = await configSource(project, options.config)
  const runId = safeIdentifier(
    options.id ??
      `run-${new Date().toISOString().replace(/[-:.]/gu, '').toLowerCase()}-${randomBytes(4).toString('hex')}`,
    'Run ID'
  )
  const paths = runPaths(project, slug, runId)
  await ensureDirectory(experiment.runs)
  await mkdir(paths.run)
  await ensureDirectory(paths.artifacts)
  await writeFile(paths.metrics, '', { flag: 'wx' })
  await writeFile(paths.log, '', { flag: 'wx' })
  if (source) {
    await copyFile(source, paths.config, constants.COPYFILE_EXCL)
  }
  for (const [file, content] of Object.entries(launch?.files ?? {})) {
    await writeFile(path.join(paths.run, file), content, { flag: 'wx' })
  }
  const createdAt = new Date().toISOString()
  const manifest = {
    schemaVersion: 1,
    externalRunId: runId,
    name,
    ...(options.command ? { command: options.command } : {}),
    ...(launch?.execution ? { execution: launch.execution } : {}),
    code,
    ...(launch?.launch ? { launch: launch.launch } : {}),
    ...(launch?.agent ? { agent: launch.agent } : {}),
    metrics: { path: 'metrics.jsonl', ...(definitions ? { definitions } : {}) },
    ...(options.datasetId
      ? {
          evaluation: {
            datasetId: options.datasetId,
            ...(options.datasetRevision ? { datasetRevision: options.datasetRevision } : {}),
            ...(options.split ? { split: options.split } : {}),
            ...(options.evaluatorRevision ? { evaluatorRevision: options.evaluatorRevision } : {})
          }
        }
      : {}),
    artifacts: {
      log: 'train.log',
      ...(source ? { config: 'config.json' } : {}),
      output: 'artifacts'
    },
    harness: { createdAt, status: launch ? 'launched' : 'unreported' }
  }
  // Why atomic: an .aster catalog lists a Run as soon as run.json parses, so it must never be partial.
  await writeJsonAtomically(paths.manifest, manifest)
  // Why: in .aster the Run exists once run.json is written; no shared list to update.
  if (projectLayout(project).kind === 'legacy') {
    const prefix = runRelativePath(project, slug, runId)
    await updateCatalog(project, (catalog) => {
      const indexed = catalog.experiments.find((entry) => entry.slug === slug)
      if (!indexed || !Array.isArray(indexed.runs)) {
        throw new Error(`Experiment ${slug} is missing from the research catalog`)
      }
      indexed.runs.push({
        id: runId,
        name,
        manifest: `${prefix}/run.json`,
        metrics: `${prefix}/metrics.jsonl`,
        log: `${prefix}/train.log`,
        config: source ? `${prefix}/config.json` : null
      })
      return catalog
    })
  }
  return { project, experiment: slug, runId, ref: runReference(slug, runId), paths, manifest }
}
