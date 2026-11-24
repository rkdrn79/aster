import { lstat, readFile, realpath } from 'node:fs/promises'
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
import { readRunManifest, resolveRunReference } from './research-run-manifest.mjs'
import { compareRecordedConditions } from './research-run-conditions.mjs'
import { readRunOutputSampleIds, runOutputsPath } from './research-run-outputs.mjs'
import {
  INACTIVE_STATES,
  MAX_RUNS,
  fileEvidence,
  finding,
  metricLabel,
  plural
} from './research-checks-common.mjs'
import { codeOriginFindings, createRunCheckContext, runFindings } from './research-checks-run.mjs'

export { RULE_CHECKS } from './research-checks-common.mjs'

const SEVERITY_ORDER = { fail: 0, warn: 1, info: 2 }
const STEP_TOLERANCE = 0.1
const MAX_OUTPUTS_BYTES = 5 * 1024 * 1024
const MAX_CONFIG_BYTES = 1024 * 1024
const SAMPLE_EVIDENCE = 8
const CLAIM_CHECKS = {
  mismatch: 'claims.mismatch',
  'missing-evidence': 'claims.missing-evidence',
  stale: 'claims.stale'
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
  const context = createRunCheckContext(project, runs)
  for (const run of runs) {
    findings.push(...(await runFindings(project, run, brief, context)))
  }
  findings.push(...codeOriginFindings(slug, context))
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
