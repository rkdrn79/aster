import { realpath } from 'node:fs/promises'
import path from 'node:path'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { withFileLock } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  appendLedgerEntry,
  existingExperiment,
  nextLedgerId,
  readLedgerEntries
} from './research-jsonl-ledger.mjs'
import { experimentPaths, experimentRelativePath } from './research-layout.mjs'
import { projectFile, projectRelative } from './research-manuscript-numbers.mjs'
import { resolveRunReference } from './research-run-manifest.mjs'

export const ANALYSIS_KINDS = ['figure', 'table', 'note']
const AUTHORS = ['agent', 'user']
const MAX_TITLE = 200
const MAX_SUMMARY = 2000
const MAX_LINKED_RUNS = 24
const CONTEXT_SUMMARY = 400
const ANALYSIS_ID = /^analysis-[1-9]\d*$/u
// Why: figures load through Aster's image preview and tables/notes as bounded text, so only these show.
const KIND_BY_EXTENSION = {
  '.png': 'figure',
  '.jpg': 'figure',
  '.jpeg': 'figure',
  '.gif': 'figure',
  '.webp': 'figure',
  '.csv': 'table',
  '.tsv': 'table',
  '.json': 'table',
  '.md': 'note',
  '.txt': 'note'
}

function analysisLedger(project, slug) {
  return path.join(experimentPaths(project, slug).experiment, 'analysis.jsonl')
}

function relativeLedger(project, slug) {
  return `${experimentRelativePath(project, slug)}/analysis.jsonl`
}

/** The folder agents keep analysis scripts and outputs in; recommended, not required. */
export function analysisFolder(project, slug) {
  return `${experimentRelativePath(project, slug)}/analysis`
}

function requiredText(value, label, limit) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > limit) {
    throw new HarnessError('invalid_argument', `${label} must contain 1–${limit} characters`)
  }
  return text
}

function analysisAuthor(requested, identity) {
  const inAgentSession = Boolean(identity?.provider || identity?.sessionId)
  const by = requested ?? (inAgentSession ? 'agent' : 'user')
  if (!AUTHORS.includes(by)) {
    throw new HarnessError('invalid_argument', `--by must be one of: ${AUTHORS.join(', ')}`)
  }
  // Why: an agent shell cannot speak as the user, as for findings and Run notes.
  if (by === 'user' && inAgentSession) {
    throw new HarnessError(
      'forbidden',
      '--by user is refused inside an agent session; the user records analyses in Aster'
    )
  }
  return by
}

async function analysisFile(project, file) {
  if (typeof file !== 'string' || !file.trim()) {
    throw new HarnessError('usage', '--file needs a project-relative path')
  }
  let actual
  try {
    actual = await projectFile(project, file)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new HarnessError('not_found', `No such file in the project: ${file}`)
    }
    if (error instanceof HarnessError) {
      throw new HarnessError(
        'invalid_argument',
        `Analysis file must be a regular file of at most 10 MiB inside the project: ${file}`
      )
    }
    throw error
  }
  return { actual, relative: projectRelative(project, actual) }
}

function analysisKind(file, requested) {
  const derived = KIND_BY_EXTENSION[path.extname(file).toLowerCase()]
  if (!derived) {
    throw new HarnessError(
      'invalid_argument',
      `Analysis files are png, jpg, jpeg, gif, webp (figure), csv, tsv, json (table), or md, txt (note): ${file}`
    )
  }
  if (requested === undefined || requested === null) {
    return derived
  }
  if (!ANALYSIS_KINDS.includes(requested)) {
    throw new HarnessError(
      'invalid_argument',
      `--kind must be one of: ${ANALYSIS_KINDS.join(', ')}`
    )
  }
  // Why: a figure is shown as an image and a table or note as text, so the kind must fit the file.
  if ((requested === 'figure') !== (derived === 'figure')) {
    throw new HarnessError(
      'invalid_argument',
      `--kind ${requested} does not fit ${path.basename(file)}; figures are images, tables and notes are text`
    )
  }
  return requested
}

async function linkedRuns(project, references) {
  const unique = [...new Set(references ?? [])]
  if (unique.length > MAX_LINKED_RUNS) {
    throw new HarnessError('invalid_argument', `An analysis links at most ${MAX_LINKED_RUNS} Runs`)
  }
  const resolved = []
  for (const reference of unique) {
    resolved.push((await resolveRunReference(project, reference)).ref)
  }
  return [...new Set(resolved)]
}

/** One row per recorded analysis, oldest first, with `supersededBy` from later entries. */
function deriveAnalyses(slug, entries) {
  const recorded = new Map()
  const replacements = new Map()
  for (const entry of entries) {
    if (entry?.type !== 'analysis' || typeof entry.id !== 'string' || recorded.has(entry.id)) {
      continue
    }
    if (recorded.has(entry.supersedes) && !replacements.has(entry.supersedes)) {
      replacements.set(entry.supersedes, entry.id)
    }
    recorded.set(entry.id, entry)
  }
  return [...recorded.values()].map((entry) => ({
    id: entry.id,
    at: entry.at,
    experiment: slug,
    title: entry.title,
    kind: entry.kind,
    file: entry.file,
    summary: entry.summary ?? '',
    runs: entry.runs ?? [],
    by: entry.by,
    agent: entry.agent ?? null,
    supersedes: entry.supersedes ?? null,
    supersededBy: replacements.get(entry.id) ?? null
  }))
}

/** Records a figure, table, or note file and its takeaway for an Experiment. */
export async function addAnalysis(projectPath, input, { env = process.env } = {}) {
  const identity = agentIdentityFromEnvironment(env)
  const by = analysisAuthor(input.by, identity)
  const project = await realpath(projectPath)
  const slug = await existingExperiment(project, input.experiment)
  const title = requiredText(input.title, 'Title', MAX_TITLE)
  const summary = requiredText(input.summary, 'Summary', MAX_SUMMARY)
  const file = await analysisFile(project, input.file)
  const kind = analysisKind(file.actual, input.kind)
  const runs = await linkedRuns(project, input.runs)
  const supersedes = input.supersedes ?? null
  if (supersedes !== null && !ANALYSIS_ID.test(supersedes)) {
    throw new HarnessError('invalid_argument', `Not an analysis ID: ${supersedes}`)
  }
  const target = analysisLedger(project, slug)
  const analysis = await withFileLock(`${target}.lock`, async () => {
    const entries = await readLedgerEntries(target)
    if (supersedes !== null) {
      const replaced = deriveAnalyses(slug, entries).find((item) => item.id === supersedes)
      if (!replaced) {
        throw new HarnessError('not_found', `No analysis ${supersedes} in ${slug}`)
      }
      if (replaced.supersededBy) {
        throw new HarnessError(
          'already_superseded',
          `${supersedes} is already superseded by ${replaced.supersededBy}; supersede that one`
        )
      }
    }
    const created = {
      schemaVersion: 1,
      id: nextLedgerId(entries, 'analysis'),
      type: 'analysis',
      at: new Date().toISOString(),
      title,
      kind,
      file: file.relative,
      summary,
      runs,
      supersedes,
      by,
      agent: identity
    }
    await appendLedgerEntry(target, created)
    return deriveAnalyses(slug, [...entries, created]).find((item) => item.id === created.id)
  })
  return {
    experiment: slug,
    ledger: relativeLedger(project, slug),
    folder: analysisFolder(project, slug),
    analysis
  }
}

/** Every analysis of an Experiment, newest first; superseded ones stay with `supersededBy`. */
export async function listAnalyses(projectPath, experiment) {
  const project = await realpath(projectPath)
  const slug = await existingExperiment(project, experiment)
  const items = deriveAnalyses(slug, await readLedgerEntries(analysisLedger(project, slug)))
  return { experiment: slug, ledger: relativeLedger(project, slug), items: items.toReversed() }
}

function shortened(text, limit) {
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text
}

/**
 * The newest analyses not superseded, for `context`; summaries are shortened to keep the prompt
 * compact (`analysis list` has them in full). `project` is already a real path.
 */
export async function contextAnalyses(project, slug, { limit = 5 } = {}) {
  const items = deriveAnalyses(slug, await readLedgerEntries(analysisLedger(project, slug)))
  const current = items.filter((item) => !item.supersededBy).toReversed()
  return {
    items: current.slice(0, limit).map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      file: item.file,
      summary: shortened(item.summary, CONTEXT_SUMMARY)
    })),
    omitted: Math.max(0, current.length - limit)
  }
}
