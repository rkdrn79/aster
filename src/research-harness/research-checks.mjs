import { lstat, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { auditClaims, readClaimsLedger } from './research-claims.mjs'
import { readCatalog } from './research-catalog.mjs'
import { readExperimentBrief } from './research-experiment-brief.mjs'
import { HarnessError } from './research-harness-error.mjs'
import {
  experimentRelativePath,
  experimentSlug,
  layoutRelativePaths,
  runPaths,
  runReference
} from './research-layout.mjs'
import { readMetricSeries, selectMetricValue } from './research-metric-events.mjs'
import { harnessLiveness, readRunManifest, resolveRunReference } from './research-run-manifest.mjs'
import { compareRecordedConditions } from './research-run-conditions.mjs'
import { readLogFacts } from './research-run-log-facts.mjs'
import { readRunOutputSampleIds, runOutputsPath } from './research-run-outputs.mjs'

/** Rule check IDs and their severity (plan §1 A). Judgment calls are left to agent reviews. */
export const RULE_CHECKS = {
  'run.failed': 'fail',
  'run.harness-exited': 'warn',
  'run.stale': 'warn',
  'run.no-metrics': 'warn',
  'run.primary-metric-missing': 'warn',
  'run.non-finite': 'warn',
  'repro.commit-unknown': 'info',
  'repro.patch-truncated': 'warn',
  'repro.capture-not-at-launch': 'info',
  'repro.config-missing': 'info',
  'compare.baseline-missing': 'warn',
  'compare.condition-mismatch': 'fail',
  'compare.condition-unknown': 'info',
  'compare.step-mismatch': 'warn',
  'stats.too-few-seeds': 'warn',
  'output.sample-mismatch': 'warn',
  'claims.mismatch': 'fail',
  'claims.missing-evidence': 'fail',
  'claims.stale': 'warn'
}
const SEVERITY_ORDER = { fail: 0, warn: 1, info: 2 }
const STALE_AFTER_MS = 10 * 60_000
const STEP_TOLERANCE = 0.1
const MAX_OUTPUTS_BYTES = 5 * 1024 * 1024
const MAX_CONFIG_BYTES = 1024 * 1024
const MAX_RUNS = 6
const MAX_SAMPLES = 50
const MAX_EVIDENCE = 12
const MAX_TEXT = 2000
const SAMPLE_EVIDENCE = 8
const CLAIM_CHECKS = {
  mismatch: 'claims.mismatch',
  'missing-evidence': 'claims.missing-evidence',
  stale: 'claims.stale'
}
const INACTIVE_STATES = new Set(['failed', 'cancelled'])

function projectRelative(project, target) {
  return path.relative(project, target).split(path.sep).join('/')
}

async function isFile(target) {
  return lstat(target).then(
    (details) => details.isFile(),
    () => false
  )
}

function pickField(source, field) {
  let value = source
  for (const key of field.split('.')) {
    value = value && typeof value === 'object' ? value[key] : undefined
  }
  return value ?? null
}

function manifestEvidence(run, field) {
  return { kind: 'manifest', run: run.ref, field, value: pickField(run.manifest, field) }
}

function fileEvidence(project, target, line = null) {
  return { kind: 'file', path: projectRelative(project, target), line }
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function durationText(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    return null
  }
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) {
    return `${Math.round(ms / 1000)} s`
  }
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

function finding(check, { experiment, target, runs = [], samples = [], text, evidence = [] }) {
  return {
    id: `rule:${check}:${target}`,
    source: 'rule',
    check,
    layer: 'integrity',
    severity: RULE_CHECKS[check],
    status: 'open',
    experiment,
    runs: runs.slice(0, MAX_RUNS),
    samples: samples.slice(0, MAX_SAMPLES),
    text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text,
    evidence: evidence.slice(0, MAX_EVIDENCE),
    agent: null,
    statusNote: null,
    statusAt: null,
    statusBy: null
  }
}

async function readConfig(file) {
  const details = await lstat(file).catch(() => null)
  if (!details?.isFile() || details.size > MAX_CONFIG_BYTES) {
    return null
  }
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

/** Sample IDs of a Run's outputs.jsonl, or null when absent or over the read limit. */
async function readSampleIds(run) {
  const details = await lstat(runOutputsPath(run.paths.run)).catch(() => null)
  // Why skip large files: a partial ID set would report samples that are not actually missing.
  if (!details?.isFile() || details.size > MAX_OUTPUTS_BYTES) {
    return null
  }
  return readRunOutputSampleIds(run.paths.run).catch(() => null)
}

async function loadRun(project, slug, id) {
  let paths
  try {
    paths = runPaths(project, slug, id)
  } catch {
    return null
  }
  const manifest = await readRunManifest(paths).catch(() => null)
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return null
  }
  const metrics = await readMetricSeries(paths.metrics).catch((error) => ({
    error: error.message,
    series: []
  }))
  return {
    ref: runReference(slug, id),
    experiment: slug,
    paths,
    manifest,
    metrics,
    state: manifest.execution?.state ?? 'unknown'
  }
}

function metricLabel(metric) {
  return `${metric.split ? `${metric.split} ` : ''}${metric.name}`
}

function hasPrimaryMetric(run, metric) {
  return run.metrics.series.some(
    (entry) =>
      entry.metric === metric.name && (metric.split === null || entry.split === metric.split)
  )
}

async function runFindings(project, run, brief) {
  const { manifest, state, ref } = run
  const findings = []
  const add = (check, details) =>
    findings.push(
      finding(check, { experiment: run.experiment, target: ref, runs: [ref], ...details })
    )
  const failed = INACTIVE_STATES.has(state)
  const log = await readLogFacts(run.paths.log, { tail: failed }).catch(() => null)

  if (failed) {
    const exitCode = manifest.execution?.exitCode ?? null
    const took = durationText(manifest.launch?.durationMs)
    const after = took ? ` after ${took}` : ''
    add('run.failed', {
      text:
        state === 'cancelled'
          ? `Cancelled${after}`
          : exitCode === null
            ? `Failed${after}`
            : `Exited with code ${exitCode}${after}`,
      evidence: [
        manifestEvidence(run, 'execution.state'),
        ...(exitCode === null ? [] : [manifestEvidence(run, 'execution.exitCode')]),
        ...(manifest.launch?.signal ? [manifestEvidence(run, 'launch.signal')] : []),
        ...(log?.tail ? [{ kind: 'log', run: ref, ...log.tail }] : [])
      ]
    })
  }

  const exited = harnessLiveness(manifest) === 'exited'
  if (exited) {
    const pidField = manifest.launch?.harnessPid ? 'launch.harnessPid' : 'launch.pid'
    add('run.harness-exited', {
      text: `Marked running, but its run exec process (pid ${pickField(manifest, pidField)}) on this host has exited`,
      evidence: [
        manifestEvidence(run, 'execution.state'),
        manifestEvidence(run, pidField),
        manifestEvidence(run, 'launch.host')
      ]
    })
  }
  const observedAt = Date.parse(manifest.execution?.observedAt ?? '')
  if (state === 'running' && !exited && Date.now() - observedAt > STALE_AFTER_MS) {
    add('run.stale', {
      text: `Marked running, but run.json has not been updated for ${durationText(Date.now() - observedAt)}`,
      evidence: [
        manifestEvidence(run, 'execution.state'),
        manifestEvidence(run, 'execution.observedAt')
      ]
    })
  }

  const metricsFile = (await isFile(run.paths.metrics))
    ? [fileEvidence(project, run.paths.metrics)]
    : [manifestEvidence(run, 'metrics.path')]
  const noMetrics = run.metrics.series.length === 0
  if (state === 'succeeded' && noMetrics) {
    add('run.no-metrics', {
      text: run.metrics.error
        ? `Succeeded, but metrics.jsonl cannot be read: ${run.metrics.error}`
        : 'Succeeded, but metrics.jsonl has no metric values',
      evidence: metricsFile
    })
  }
  const primary = brief?.primaryMetric
  if (state === 'succeeded' && primary && !noMetrics && !hasPrimaryMetric(run, primary)) {
    const recorded = [
      ...new Set(
        run.metrics.series.map((entry) => metricLabel({ name: entry.metric, split: entry.split }))
      )
    ]
    add('run.primary-metric-missing', {
      text: `Succeeded, but has no ${metricLabel(primary)} values, the brief's primary metric (recorded: ${recorded.slice(0, 8).join(', ')}${recorded.length > 8 ? ', …' : ''})`,
      evidence: metricsFile
    })
  }

  const invalidRows = run.metrics.invalidRows ?? 0
  if (invalidRows > 0 || log?.nonFinite) {
    const parts = [
      invalidRows > 0 ? `metrics.jsonl has ${plural(invalidRows, 'unreadable row')}` : null,
      log?.nonFinite
        ? `train.log has ${plural(log.nonFinite.count, 'ASTER_METRIC line')} with NaN or Infinity (first at line ${log.nonFinite.fromLine})`
        : null
    ].filter(Boolean)
    add('run.non-finite', {
      text: parts.join('; '),
      evidence: [
        ...(invalidRows > 0 ? [fileEvidence(project, run.paths.metrics)] : []),
        ...(log?.nonFinite
          ? [
              {
                kind: 'log',
                run: ref,
                fromLine: log.nonFinite.fromLine,
                toLine: log.nonFinite.toLine,
                excerpt: log.nonFinite.excerpt
              }
            ]
          : [])
      ]
    })
  }

  const code = manifest.code
  if (!code?.commit) {
    add('repro.commit-unknown', {
      text: 'No git commit is recorded for this Run',
      evidence: [manifestEvidence(run, 'code.commit')]
    })
  }
  if (code?.dirty === true && (code.patchTruncated === true || !code.patch)) {
    add('repro.patch-truncated', {
      text: code.patchTruncated
        ? 'Launched with uncommitted changes, and code.patch was cut at the 5 MiB limit'
        : 'Launched with uncommitted changes, but no code.patch was saved',
      evidence: [
        manifestEvidence(run, 'code.dirty'),
        manifestEvidence(run, code.patchTruncated ? 'code.patchTruncated' : 'code.patch')
      ]
    })
  }
  if (code?.capturePhase !== 'at_launch') {
    const phase = code?.capturePhase ?? null
    add('repro.capture-not-at-launch', {
      text:
        phase === 'at_attach'
          ? 'Code was recorded when the Run was attached, not when it launched'
          : phase === 'imported'
            ? 'Code was recorded on import, not when the Run launched'
            : 'It is unknown when the recorded code was captured',
      evidence: [manifestEvidence(run, 'code.capturePhase')]
    })
  }
  if (!(await isFile(run.paths.config))) {
    add('repro.config-missing', {
      text: `No config.json is saved with this Run (expected ${projectRelative(project, run.paths.config)})`,
      evidence: []
    })
  }
  return findings
}

function conditionEvidence(runs, items, onlyMissing) {
  return items.flatMap(({ field, values }) =>
    runs.flatMap((run, index) =>
      onlyMissing && values[index]
        ? []
        : [{ kind: 'manifest', run: run.ref, field, value: values[index] ?? null }]
    )
  )
}

function lastPrimaryPoint(run, metric) {
  const selected = selectMetricValue(run.metrics.series, {
    metric: metric.name,
    split: metric.split,
    select: 'last'
  })
  return selected.error || selected.step === null ? null : selected
}

function metricEvidence(run, metric, point) {
  return {
    kind: 'metric',
    run: run.ref,
    metric: metric.name,
    split: point.split,
    step: point.step,
    value: point.value
  }
}

async function comparisonFindings(project, slug, brief, runs, baseline) {
  const findings = []
  const metric = brief.primaryMetric
  const baselineOutputs = await readSampleIds(baseline)
  for (const run of runs) {
    if (run.ref === baseline.ref || INACTIVE_STATES.has(run.state)) {
      continue
    }
    const pair = [run, baseline]
    const shared = { experiment: slug, target: run.ref, runs: [run.ref, baseline.ref] }
    const { differences, missing } = compareRecordedConditions(
      pair.map((item) => item.manifest),
      metric?.name ?? null
    )
    if (differences.length) {
      findings.push(
        finding('compare.condition-mismatch', {
          ...shared,
          text: `Not comparable with baseline ${baseline.ref}: ${differences.map((item) => item.name).join(', ')} ${differences.length === 1 ? 'differs' : 'differ'}`,
          evidence: conditionEvidence(pair, differences, false)
        })
      )
    } else if (missing.length) {
      findings.push(
        finding('compare.condition-unknown', {
          ...shared,
          text: `Comparability with baseline ${baseline.ref} is unknown: ${missing.map((item) => item.name).join(', ')} not recorded for both Runs`,
          evidence: conditionEvidence(pair, missing, true)
        })
      )
    }

    const point =
      metric && run.state !== 'running' && baseline.state !== 'running'
        ? lastPrimaryPoint(run, metric)
        : null
    const basePoint = point ? lastPrimaryPoint(baseline, metric) : null
    if (point && basePoint && basePoint.step !== 0) {
      const change = (point.step - basePoint.step) / Math.abs(basePoint.step)
      if (Math.abs(change) > STEP_TOLERANCE) {
        findings.push(
          finding('compare.step-mismatch', {
            ...shared,
            text: `${metricLabel(metric)} ends at step ${point.step}, baseline ${baseline.ref} at step ${basePoint.step} (${Math.round(Math.abs(change) * 100)}% ${change > 0 ? 'more' : 'less'} training)`,
            evidence: [
              metricEvidence(run, metric, point),
              metricEvidence(baseline, metric, basePoint)
            ]
          })
        )
      }
    }

    const outputs = baselineOutputs ? await readSampleIds(run) : null
    if (outputs) {
      const onlyBaseline = [...baselineOutputs].filter((id) => !outputs.has(id))
      const onlyRun = [...outputs].filter((id) => !baselineOutputs.has(id))
      if (onlyBaseline.length || onlyRun.length) {
        const samples = [
          ...onlyBaseline.map((sampleId) => ({ run: baseline.ref, sampleId })),
          ...onlyRun.map((sampleId) => ({ run: run.ref, sampleId }))
        ]
        findings.push(
          finding('output.sample-mismatch', {
            ...shared,
            samples: samples.map((item) => item.sampleId),
            text: `outputs.jsonl sample IDs differ from baseline ${baseline.ref}: ${onlyBaseline.length} only in the baseline, ${onlyRun.length} only in this Run (${outputs.size} vs ${baselineOutputs.size})`,
            evidence: [
              fileEvidence(project, runOutputsPath(run.paths.run)),
              fileEvidence(project, runOutputsPath(baseline.paths.run)),
              ...samples.slice(0, SAMPLE_EVIDENCE).map((item) => ({ kind: 'sample', ...item }))
            ]
          })
        )
      }
    }
  }
  return findings
}

function withoutSeeds(value) {
  if (Array.isArray(value)) {
    return value.map(withoutSeeds)
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !/^(?:.*\.)?seed$/iu.test(key))
      .sort()
      .map((key) => [key, withoutSeeds(value[key])])
  )
}

async function seedFindings(project, slug, brief, runs) {
  const groups = new Map()
  for (const run of runs) {
    if (INACTIVE_STATES.has(run.state)) {
      continue
    }
    const config = await readConfig(run.paths.config)
    if (config === null) {
      continue
    }
    const key = JSON.stringify(withoutSeeds(config))
    groups.set(key, [...(groups.get(key) ?? []), run])
  }
  return [...groups.values()]
    .filter((group) => group.length < brief.minSeeds)
    .map((group) =>
      finding('stats.too-few-seeds', {
        experiment: slug,
        target: group[0].ref,
        runs: group.map((run) => run.ref),
        text: `${plural(group.length, 'Run')} with this config apart from the seed; the brief asks for ${brief.minSeeds}`,
        evidence: group.slice(0, MAX_RUNS).map((run) => fileEvidence(project, run.paths.config))
      })
    )
}

async function experimentFindings(project, group, runs) {
  const slug = group.slug
  const brief = await readExperimentBrief(project, slug).catch(() => null)
  const findings = []
  for (const run of runs) {
    findings.push(...(await runFindings(project, run, brief)))
  }
  if (!brief) {
    return findings
  }
  if (runs.length && brief.baseline) {
    const resolved = await resolveRunReference(project, brief.baseline).catch(() => null)
    const baseline = resolved
      ? (runs.find((run) => run.ref === resolved.ref) ??
        (await loadRun(project, resolved.experiment, resolved.runId)))
      : null
    if (baseline) {
      findings.push(...(await comparisonFindings(project, slug, brief, runs, baseline)))
    } else {
      findings.push(
        finding('compare.baseline-missing', {
          experiment: slug,
          target: slug,
          text: resolved
            ? `The run.json of baseline ${brief.baseline} cannot be read`
            : `Baseline ${brief.baseline} is not a Run in ${layoutRelativePaths(project).catalog}`,
          evidence: [
            {
              kind: 'file',
              path: `${experimentRelativePath(project, slug)}/experiment.json`,
              line: null
            }
          ]
        })
      )
    }
  } else if (runs.length) {
    findings.push(
      finding('compare.baseline-missing', {
        experiment: slug,
        target: slug,
        text: 'The brief names no baseline Run to compare against',
        evidence: [
          {
            kind: 'file',
            path: `${experimentRelativePath(project, slug)}/experiment.json`,
            line: null
          }
        ]
      })
    )
  }
  if (brief.minSeeds !== null) {
    findings.push(...(await seedFindings(project, slug, brief, runs)))
  }
  return findings
}

function runExperiment(reference) {
  return reference.includes('/') ? reference.split('/')[0] : null
}

async function claimFindings(project, slugs) {
  if (!(await readClaimsLedger(project).catch(() => null))) {
    return []
  }
  const audit = await auditClaims(project).catch(() => null)
  const findings = []
  for (const claim of audit?.claims ?? []) {
    const check = CLAIM_CHECKS[claim.status]
    if (!check) {
      continue
    }
    // Why per Experiment: each Experiment keeps its own finding statuses.
    for (const slug of new Set(claim.evidence.map((item) => runExperiment(item.run)))) {
      if (!slugs.has(slug)) {
        continue
      }
      const evidence = claim.evidence.filter((item) => runExperiment(item.run) === slug)
      findings.push(
        finding(check, {
          experiment: slug,
          target: `claim:${claim.id}`,
          runs: [...new Set(evidence.map((item) => item.run))],
          text: `Claim ${claim.id} "${claim.text}": ${claim.reasons.join('; ') || claim.status}`,
          evidence: [
            { kind: 'claim', claim: claim.id },
            ...evidence.map((item) => ({
              kind: 'metric',
              run: item.run,
              metric: item.metric,
              split: item.split ?? null,
              step: item.step ?? null,
              value: item.currentValue ?? null
            }))
          ]
        })
      )
    }
  }
  return findings
}

/**
 * Rule checks over a project's research records; every finding starts open. A `run` keeps only
 * findings that name it, including those of the `experiment` whose baseline it is.
 */
export async function runChecks(projectPath, { experiment = null, run = null } = {}) {
  const project = await realpath(projectPath)
  const checkedAt = new Date().toISOString()
  const catalog = await readCatalog(project)
  const scope = experiment ? experimentSlug(experiment) : null
  // Why: inside one Experiment a bare Run ID is unambiguous even when other Experiments reuse it.
  const reference = run && scope && !run.includes('/') ? runReference(scope, run) : run
  const target = reference ? await resolveRunReference(project, reference) : null
  const selected = scope ?? target?.experiment ?? null
  if (selected && !catalog.experiments.some((group) => group.slug === selected)) {
    throw new HarnessError(
      'experiment_not_found',
      `Experiment ${selected} is not in ${layoutRelativePaths(project).catalog}`
    )
  }
  const slugs = new Set()
  const findings = []
  for (const group of catalog.experiments) {
    if (selected && group.slug !== selected) {
      continue
    }
    slugs.add(group.slug)
    const runs = []
    for (const entry of group.runs ?? []) {
      const loaded = await loadRun(project, group.slug, entry.id)
      if (loaded) {
        runs.push(loaded)
      }
    }
    findings.push(...(await experimentFindings(project, group, runs)))
  }
  findings.push(...(await claimFindings(project, slugs)))
  const shown = target ? findings.filter((item) => item.runs.includes(target.ref)) : findings
  return {
    checkedAt,
    findings: shown
      .map((item) => ({ ...item, createdAt: checkedAt }))
      .sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity])
  }
}
