import { lstatSync } from 'node:fs'
import path from 'node:path'
import { HarnessError } from './research-harness-error.mjs'

/** Aster's record tree inside a project (ADR-004): everything in it is written through the harness. */
export const ASTER_DIRECTORY = '.aster'
/** The record tree of projects set up before ADR-004. It is still read and written in place. */
export const LEGACY_RESEARCH_DIRECTORY = 'research'
/** @deprecated Pre-ADR-004 name; use projectLayout(project).root. */
export const RESEARCH_DIRECTORY = LEGACY_RESEARCH_DIRECTORY

const ASTER_LAYOUT = Object.freeze({
  kind: 'aster',
  root: ASTER_DIRECTORY,
  manuscriptSource: 'paper/main.tex',
  manuscriptPdf: 'paper/main.pdf',
  bibliography: 'paper/references.bib',
  papers: `${ASTER_DIRECTORY}/library/papers`
})

const LEGACY_LAYOUT = Object.freeze({
  kind: 'legacy',
  root: LEGACY_RESEARCH_DIRECTORY,
  manuscriptSource: `${LEGACY_RESEARCH_DIRECTORY}/manuscript/main.tex`,
  manuscriptPdf: `${LEGACY_RESEARCH_DIRECTORY}/manuscript/main.pdf`,
  bibliography: `${LEGACY_RESEARCH_DIRECTORY}/references/library.bib`,
  papers: `${LEGACY_RESEARCH_DIRECTORY}/references/papers`
})

function isRegularFile(target) {
  try {
    return lstatSync(target).isFile()
  } catch {
    return false
  }
}

/**
 * The record tree a project uses, with project-relative `/` paths for its default files.
 * `.aster/` wins when both exist; a project with neither gets `.aster/` on its first write.
 */
export function projectLayout(projectPath) {
  if (isRegularFile(path.join(projectPath, ASTER_DIRECTORY, 'project.json'))) {
    return ASTER_LAYOUT
  }
  if (isRegularFile(path.join(projectPath, LEGACY_RESEARCH_DIRECTORY, 'project.json'))) {
    return LEGACY_LAYOUT
  }
  return ASTER_LAYOUT
}

/** Project-relative `/` paths of the record tree, for catalog entries and messages. */
export function layoutRelativePaths(projectPath) {
  const layout = projectLayout(projectPath)
  return {
    ...layout,
    catalog: `${layout.root}/project.json`,
    claims: `${layout.root}/claims.json`,
    experiments: `${layout.root}/experiments`
  }
}

export function experimentRelativePath(projectPath, slug) {
  return `${layoutRelativePaths(projectPath).experiments}/${safeExperimentSlug(slug)}`
}

export function runRelativePath(projectPath, slug, runId) {
  return `${experimentRelativePath(projectPath, slug)}/runs/${safeIdentifier(runId, 'Run ID')}`
}

export function experimentSlug(name) {
  if (typeof name !== 'string' || !name.trim() || /[\\/\0]/u.test(name) || name.includes('..')) {
    throw new HarnessError(
      'invalid_argument',
      'Experiment name must be nonempty and cannot contain path separators or ..'
    )
  }
  const slug = name
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
  if (!slug || slug.length > 64) {
    throw new HarnessError(
      'invalid_argument',
      'Experiment name must produce a folder name of 1–64 characters'
    )
  }
  return slug
}

export function safeIdentifier(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(value)) {
    throw new HarnessError(
      'invalid_argument',
      `${label} must use 1–64 lowercase letters, digits, or hyphens`
    )
  }
  return value
}

export function safeExperimentSlug(value) {
  if (typeof value !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N}-]{0,63}$/u.test(value)) {
    throw new HarnessError(
      'invalid_argument',
      'Experiment slug must use 1–64 letters, digits, or hyphens'
    )
  }
  return value
}

/** Absolute folders of the record tree; `manuscript` and `references` hold the default files. */
export function researchPaths(projectPath) {
  const layout = projectLayout(projectPath)
  const root = path.join(projectPath, layout.root)
  return {
    root,
    experiments: path.join(root, 'experiments'),
    manuscript: path.join(projectPath, ...path.posix.dirname(layout.manuscriptSource).split('/')),
    references: path.join(projectPath, ...path.posix.dirname(layout.papers).split('/'))
  }
}

export function experimentPaths(projectPath, slug) {
  const experiment = path.join(researchPaths(projectPath).experiments, safeExperimentSlug(slug))
  return { experiment, runs: path.join(experiment, 'runs') }
}

export function runPaths(projectPath, experiment, runId) {
  const run = path.join(
    experimentPaths(projectPath, experiment).runs,
    safeIdentifier(runId, 'Run ID')
  )
  return {
    run,
    manifest: path.join(run, 'run.json'),
    metrics: path.join(run, 'metrics.jsonl'),
    log: path.join(run, 'train.log'),
    config: path.join(run, 'config.json'),
    artifacts: path.join(run, 'artifacts')
  }
}

export function claimsLedgerPath(projectPath) {
  return path.join(researchPaths(projectPath).root, 'claims.json')
}

export function loopLedgerPath(projectPath, slug) {
  return path.join(experimentPaths(projectPath, slug).experiment, 'loop.jsonl')
}

export function runReference(experiment, runId) {
  return `${experiment}/${runId}`
}

/**
 * The project Library (ADR-003 server owner §2, ADR-004): the paper list with status, tags and notes,
 * highlights, and the folder imported PDFs go to. The bibliography is the catalog's
 * `references.bibliography`, which the user may point at an existing `.bib`.
 */
export function libraryPaths(projectPath) {
  const layout = projectLayout(projectPath)
  const root =
    layout.kind === 'aster'
      ? path.join(projectPath, ASTER_DIRECTORY, 'library')
      : path.join(projectPath, LEGACY_RESEARCH_DIRECTORY, 'references')
  return {
    root,
    library: path.join(root, 'library.json'),
    annotations: path.join(root, 'annotations.jsonl'),
    papers: path.join(root, 'papers')
  }
}

/**
 * Records tied to one machine or runtime (session IDs, absolute paths). They stay out of git:
 * `.aster/local/` is in `.aster/.gitignore`; the legacy tree used `research/.aster/`.
 */
export function localStatePaths(projectPath) {
  const layout = projectLayout(projectPath)
  const root =
    layout.kind === 'aster'
      ? path.join(projectPath, ASTER_DIRECTORY, 'local')
      : path.join(projectPath, LEGACY_RESEARCH_DIRECTORY, ASTER_DIRECTORY)
  return {
    root,
    workbench: path.join(root, 'workbench.json'),
    attachments: path.join(root, 'attachments.json')
  }
}

/** `.aster/.gitignore`: evidence is committed; bulky files and per-machine state are not. */
export const ASTER_GITIGNORE = `# Written by Aster. Run evidence (run.json, metrics, summaries, ledgers) is committed;
# per-machine state, caches, PDFs and bulky Run outputs are not.
local/
cache/
latex-build/
library/papers/*
!library/papers/.gitkeep
experiments/*/runs/*/train.log
experiments/*/runs/*/artifacts/
*.lock
`
