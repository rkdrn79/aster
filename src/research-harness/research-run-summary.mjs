import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { agentIdentityFromEnvironment } from './research-agent-identity.mjs'
import { readCatalog } from './research-catalog.mjs'
import { runChecks } from './research-checks.mjs'
import { readExperimentBrief } from './research-experiment-brief.mjs'
import { withFileLock, writeJsonAtomically } from './research-file-transactions.mjs'
import { HarnessError } from './research-harness-error.mjs'
import { experimentSlug, layoutRelativePaths, runPaths, runReference } from './research-layout.mjs'
import { readMetricSeries, selectMetricValue } from './research-metric-events.mjs'
import { MEDIA_KINDS, OUTPUT_MEDIA_LIMIT, runMediaIndex } from './research-run-media.mjs'
import { readRunManifest, resolveRunReference } from './research-run-manifest.mjs'
import { readRunOutputs } from './research-run-outputs.mjs'

export const RUN_SUMMARY_FILE = 'summary.json'
const NOTE_AUTHORS = ['agent', 'user']
const MAX_NOTE = 2000
const MAX_SUMMARY_BYTES = 2 * 1024 * 1024

function summaryFile(run) {
  return path.join(run.paths.run, RUN_SUMMARY_FILE)
}

/** summary.json as written, or null when absent or unreadable (organize rewrites it). */
async function readSummaryFile(file) {
  const stats = await lstat(file).catch(() => null)
  if (!stats?.isFile() || stats.size > MAX_SUMMARY_BYTES) {
    return null
  }
  try {
    const value = JSON.parse(await readFile(file, 'utf8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch {
    return null
  }
}

export function storedNotes(value) {
  return Array.isArray(value)
    ? value.filter((note) => typeof note?.text === 'string' && typeof note.at === 'string')
    : []
}

async function metricSeries(paths) {
  return (await readMetricSeries(paths.metrics).catch(() => null))?.series ?? []
}

function selectedPoint(series, query) {
  const selected = selectMetricValue(series, query)
  return selected.error
    ? null
    : { value: selected.value, step: selected.step, split: selected.split }
}

function pointOf(selected) {
  return selected ? { value: selected.value, step: selected.step } : null
}

/** Absolute difference, rounded so 0.83 - 0.8 reads 0.03 (plan C7: no direction, no ratio). */
function difference(left, right) {
  return left && right ? Number((left.value - right.value).toPrecision(12)) : null
}

function seriesPoints(series, metric, split) {
  const last = selectedPoint(series, { metric: metric.name, split, select: 'last' })
  const best = selectedPoint(series, {
    metric: metric.name,
    split,
    select: 'best',
    direction: metric.direction
  })
  return { last, best }
}

/** Brief, baseline series, and rule findings shared by every Run of one Experiment. */
async function experimentContext(project, slug) {
  const brief = await readExperimentBrief(project, slug).catch(() => null)
  const baseline = brief?.baseline
    ? await resolveRunReference(project, brief.baseline).catch(() => null)
    : null
  return {
    brief,
    baseline: baseline ? { ref: baseline.ref, series: await metricSeries(baseline.paths) } : null,
    findings: (await runChecks(project, { experiment: slug })).findings
  }
}

function findingCounts(findings, ref) {
  const counts = { fail: 0, warn: 0, info: 0 }
  for (const finding of findings) {
    if (finding.runs.includes(ref) && finding.severity in counts) {
      counts[finding.severity] += 1
    }
  }
  return counts
}

function primarySummary(series, metric) {
  if (!metric) {
    return null
  }
  const { last, best } = seriesPoints(series, metric, metric.split)
  return last
    ? {
        metric: metric.name,
        split: last.split,
        direction: metric.direction,
        last: pointOf(last),
        best: pointOf(best)
      }
    : null
}

// Why null for the baseline itself: a Run compared with itself says nothing.
function baselineSummary(ref, primary, metric, baseline) {
  if (!primary || !baseline || baseline.ref === ref) {
    return null
  }
  const { last, best } = seriesPoints(baseline.series, metric, primary.split)
  return {
    run: baseline.ref,
    last: pointOf(last),
    best: pointOf(best),
    delta: { last: difference(primary.last, last), best: difference(primary.best, best) }
  }
}

/** summary.json contents (plan C7) from run.json, metrics, the brief, checks, media, and outputs. */
async function computedSummary(project, run, context) {
  const manifest = await readRunManifest(run.paths)
  const metric = context.brief?.primaryMetric ?? null
  const primary = primarySummary(await metricSeries(run.paths), metric)
  const outputs = await readRunOutputs(run.paths.run, { mediaLimit: OUTPUT_MEDIA_LIMIT }).catch(
    () => null
  )
  const media = await runMediaIndex(project, run, { outputs })
  const mediaCounts = Object.fromEntries(MEDIA_KINDS.map((kind) => [kind, 0]))
  for (const item of media.items) {
    mediaCounts[item.kind] += 1
  }
  const exitCode = manifest.execution?.exitCode
  const durationMs = manifest.launch?.durationMs
  return {
    schemaVersion: 1,
    run: run.ref,
    generatedAt: new Date().toISOString(),
    state: typeof manifest.execution?.state === 'string' ? manifest.execution.state : 'unknown',
    exitCode: Number.isInteger(exitCode) ? exitCode : null,
    durationMs: typeof durationMs === 'number' && Number.isFinite(durationMs) ? durationMs : null,
    primary,
    baseline: baselineSummary(run.ref, primary, metric, context.baseline),
    findings: findingCounts(context.findings, run.ref),
    media: mediaCounts,
    outputs: outputs ? { samples: outputs.sampleIds.size } : null,
    notes: []
  }
}

/** Read-modify-write of summary.json under summary.json.lock with an atomic replace. */
export async function updateSummary(run, update) {
  const file = summaryFile(run)
  return withFileLock(`${file}.lock`, async () => {
    const next = update(await readSummaryFile(file))
    await writeJsonAtomically(file, next)
    return next
  })
}

async function organizeRun(project, run, context) {
  const computed = await computedSummary(project, run, context)
  return updateSummary(run, (current) => ({ ...computed, notes: storedNotes(current?.notes) }))
}

function catalogRun(project, slug, entry) {
  return {
    ref: runReference(slug, entry.id),
    experiment: slug,
    runId: entry.id,
    entry,
    paths: runPaths(project, slug, entry.id)
  }
}

async function experimentRuns(project, experiment) {
  const slug = experimentSlug(experiment)
  const group = (await readCatalog(project)).experiments.find((entry) => entry.slug === slug)
  if (!group) {
    throw new HarnessError(
      'experiment_not_found',
      `Experiment ${slug} is not in ${layoutRelativePaths(project).catalog}`
    )
  }
  return { slug, entries: group.runs ?? [] }
}

/**
 * Recomputes summary.json for one Run or every catalog Run of an Experiment. Notes are kept;
 * an Experiment's Runs that cannot be organized are listed in `errors`.
 */
export async function organizeRuns(projectPath, { run = null, experiment = null } = {}) {
  if (Boolean(run) === Boolean(experiment)) {
    throw new HarnessError('usage', 'Pass either --run EXPERIMENT/RUN or --experiment SLUG')
  }
  const project = await realpath(projectPath)
  if (run) {
    const target = await resolveRunReference(project, run)
    const summary = await organizeRun(
      project,
      target,
      await experimentContext(project, target.experiment)
    )
    return { organized: 1, runs: [summary], errors: [] }
  }
  const { slug, entries } = await experimentRuns(project, experiment)
  const context = await experimentContext(project, slug)
  const runs = []
  const errors = []
  for (const entry of entries) {
    const ref = runReference(slug, String(entry.id))
    try {
      runs.push(await organizeRun(project, catalogRun(project, slug, entry), context))
    } catch (error) {
      errors.push({ run: ref, message: error.message })
    }
  }
  return { organized: runs.length, runs, errors }
}

/** For run exec and run finish: organizing is best effort and never changes their outcome. */
export async function organizeEndedRun(project, reference, notice) {
  try {
    await organizeRuns(project, { run: reference })
  } catch (error) {
    notice(`could not write summary.json for ${reference}: ${error.message}`)
  }
}

/** Each catalog Run of an Experiment with its summary.json as written; null until organized. */
export async function readRunSummaries(projectPath, experiment) {
  const project = await realpath(projectPath)
  const { slug, entries } = await experimentRuns(project, experiment)
  const runs = []
  for (const entry of entries) {
    const ref = runReference(slug, String(entry.id))
    let summary = null
    try {
      summary = await readSummaryFile(summaryFile(catalogRun(project, slug, entry)))
    } catch {
      summary = null
    }
    runs.push({ run: ref, summary })
  }
  return { runs }
}

export function noteText(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > MAX_NOTE) {
    throw new HarnessError('invalid_argument', `Note text must contain 1–${MAX_NOTE} characters`)
  }
  return text
}

/**
 * Appends a note to the Run's summary.json, organizing it first when it has none. A user note
 * is refused from an agent session, as for findings.
 */
export async function annotateRun(projectPath, input, { env = process.env } = {}) {
  const identity = agentIdentityFromEnvironment(env)
  const inAgentSession = Boolean(identity?.provider || identity?.sessionId)
  const by = input.by ?? (inAgentSession ? 'agent' : 'user')
  if (!NOTE_AUTHORS.includes(by)) {
    throw new HarnessError('invalid_argument', `--by must be one of: ${NOTE_AUTHORS.join(', ')}`)
  }
  if (by === 'user' && inAgentSession) {
    throw new HarnessError(
      'forbidden',
      '--by user is refused inside an agent session; the user writes their notes in Aster'
    )
  }
  const text = noteText(input.text)
  const project = await realpath(projectPath)
  const run = await resolveRunReference(project, input.run)
  const note = {
    at: new Date().toISOString(),
    text,
    by,
    ...(by === 'agent' && identity ? { agent: identity } : {})
  }
  // Why computed outside the lock: rule checks read every Run, longer than a lock waiter waits.
  const computed = (await readSummaryFile(summaryFile(run)))
    ? null
    : await computedSummary(project, run, await experimentContext(project, run.experiment))
  const summary = await updateSummary(run, (current) => {
    const base = current ?? computed
    if (!base) {
      throw new HarnessError('not_found', `summary.json of ${run.ref} disappeared; retry`)
    }
    return { ...base, notes: [...storedNotes(base.notes), note] }
  })
  return {
    ref: run.ref,
    summary: path.relative(project, summaryFile(run)).split(path.sep).join('/'),
    note,
    notes: summary.notes
  }
}
