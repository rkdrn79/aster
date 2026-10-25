import { lstat, open, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { contextAnalyses } from './research-analysis.mjs'
import { auditClaims, readClaimsLedger } from './research-claims.mjs'
import { readCatalog } from './research-catalog.mjs'
import { readExperimentBrief } from './research-experiment-brief.mjs'
import { experimentSlug, loopLedgerPath, runPaths, runReference } from './research-layout.mjs'
import { readLoopLedger } from './research-loop-ledger.mjs'
import { readMetricSeries, summarizeMetricSeries } from './research-metric-events.mjs'
import { readRunManifest, resolveRunReference, runStatusSummary } from './research-run-manifest.mjs'

const MAX_CONTEXT_SERIES_PER_RUN = 12

function experimentFilter(experiment) {
  return experiment ? experimentSlug(experiment) : null
}

function runRow(slug, entry, manifest, error = null) {
  return {
    ref: runReference(slug, entry.id),
    experiment: slug,
    id: entry.id,
    name: entry.name,
    ...runStatusSummary(manifest),
    command: manifest?.command ?? null,
    commit: manifest?.code?.commit ?? null,
    dirty: manifest?.code?.dirty ?? null,
    capturePhase: manifest?.code?.capturePhase ?? null,
    patch: manifest?.code?.patch ?? null,
    agent: manifest?.agent ?? null,
    ...(error ? { error } : {})
  }
}

async function loadRun(project, slug, entry) {
  try {
    const manifest = await readRunManifest(runPaths(project, slug, entry.id))
    return { manifest, row: runRow(slug, entry, manifest) }
  } catch (error) {
    return { manifest: null, row: runRow(slug, entry, null, error.message) }
  }
}

export async function listRuns(projectPath, { experiment: selected = null, state = null } = {}) {
  const project = await realpath(projectPath)
  const experiment = experimentFilter(selected)
  const catalog = await readCatalog(project)
  const runs = []
  for (const group of catalog.experiments) {
    if (experiment && group.slug !== experiment) {
      continue
    }
    for (const entry of group.runs ?? []) {
      const { row } = await loadRun(project, group.slug, entry)
      if (!state || row.state === state) {
        runs.push(row)
      }
    }
  }
  return { project, runs }
}

async function metricSummary(paths, manifest) {
  try {
    const { rows, invalidRows, series } = await readMetricSeries(paths.metrics)
    return {
      rows,
      invalidRows,
      series: summarizeMetricSeries(series, manifest?.metrics?.definitions)
    }
  } catch (error) {
    return { rows: 0, invalidRows: 0, series: [], error: error.message }
  }
}

async function logTail(file, lines) {
  if (lines <= 0) {
    return []
  }
  const handle = await open(file, 'r').catch(() => null)
  if (!handle) {
    return []
  }
  try {
    const { size } = await handle.stat()
    const length = Math.min(size, 64 * 1024)
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, size - length)
    return buffer.toString('utf8').split(/\r?\n/u).filter(Boolean).slice(-lines)
  } finally {
    await handle.close()
  }
}

function relativeToProject(project, target) {
  return path.relative(project, target).split(path.sep).join('/')
}

export async function showRun(projectPath, reference, { logLines = 20 } = {}) {
  const project = await realpath(projectPath)
  const run = await resolveRunReference(project, reference)
  const { manifest, row } = await loadRun(project, run.experiment, run.entry)
  const paths = Object.fromEntries(
    Object.entries(run.paths).map(([key, value]) => [key, relativeToProject(project, value)])
  )
  const artifactFiles = await readdir(run.paths.artifacts).catch(() => [])
  return {
    run: row,
    paths,
    manifest,
    metrics: await metricSummary(run.paths, manifest),
    artifacts: { directory: artifactFiles, recorded: manifest?.artifacts?.files ?? [] },
    logTail: await logTail(run.paths.log, logLines)
  }
}

function compactSeries(series, definitions) {
  // Why: defined metrics are the ones the user said matter, so they survive the cap first.
  const ranked = series
    .map((item) => ({
      item,
      key: `${definitions?.[item.name] ? 0 : 1}${item.name}\0${item.split ?? ''}`
    }))
    .sort((left, right) => (left.key < right.key ? -1 : 1))
    .map(({ item }) => item)
  return {
    shown: ranked.slice(0, MAX_CONTEXT_SERIES_PER_RUN).map((item) => ({
      name: item.name,
      split: item.split,
      last: item.last,
      lastStep: item.lastStep,
      best: item.best,
      bestStep: item.bestStep,
      direction: item.direction,
      count: item.count
    })),
    omitted: Math.max(0, ranked.length - MAX_CONTEXT_SERIES_PER_RUN)
  }
}

async function loopSummary(project, slug) {
  const exists = await lstat(loopLedgerPath(project, slug)).then(
    () => true,
    () => false
  )
  if (!exists) {
    return null
  }
  const ledger = await readLoopLedger(project, slug, { limit: 3 })
  return {
    objective: ledger.objective?.text ?? null,
    objectiveData: ledger.objective?.data ?? null,
    budget: ledger.budget,
    openHypotheses: ledger.openHypotheses,
    recent: ledger.entries.map((item) => ({ id: item.id, kind: item.kind, text: item.text }))
  }
}

/** Compact project state for an agent prompt: latest Runs per Experiment with metric summaries. */
export async function projectContext(
  projectPath,
  { experiment: selected = null, limit = 10 } = {}
) {
  const project = await realpath(projectPath)
  const experiment = experimentFilter(selected)
  const catalog = await readCatalog(project)
  const pdf = catalog.manuscript?.pdf ?? null
  const pdfExists = pdf
    ? await lstat(path.join(project, pdf)).then(
        () => true,
        () => false
      )
    : false
  const byState = {}
  let runCount = 0
  const experiments = []
  for (const group of catalog.experiments) {
    const entries = group.runs ?? []
    runCount += entries.length
    const runs = []
    for (const [index, entry] of entries.entries()) {
      const { manifest, row } = await loadRun(project, group.slug, entry)
      byState[row.state] = (byState[row.state] ?? 0) + 1
      if ((experiment && group.slug !== experiment) || index < entries.length - limit) {
        continue
      }
      const metrics = await metricSummary(runPaths(project, group.slug, entry.id), manifest)
      const compact = compactSeries(metrics.series, manifest?.metrics?.definitions)
      runs.push({
        ...row,
        metrics: compact.shown,
        metricsOmitted: compact.omitted,
        ...(metrics.error ? { metricsError: metrics.error } : {})
      })
    }
    if (experiment && group.slug !== experiment) {
      continue
    }
    const analyses = await contextAnalyses(project, group.slug).catch(() => null)
    experiments.push({
      slug: group.slug,
      name: group.name,
      runCount: entries.length,
      brief: await readExperimentBrief(project, group.slug).catch(() => null),
      runs,
      loop: await loopSummary(project, group.slug).catch(() => null),
      analyses: analyses?.items ?? [],
      analysesOmitted: analyses?.omitted ?? 0
    })
  }
  const claims = (await readClaimsLedger(project).catch(() => null))
    ? (await auditClaims(project)).summary
    : null
  return {
    project,
    manuscript: { source: catalog.manuscript?.source ?? null, pdf, pdfExists },
    claimsPath: catalog.claims ?? null,
    totals: { experiments: catalog.experiments.length, runs: runCount, byState },
    experiments,
    claims
  }
}
