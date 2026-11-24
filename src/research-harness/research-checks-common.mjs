import { lstat } from 'node:fs/promises'
import path from 'node:path'

/** Rule check IDs and their severity (plan §1 A). Judgment calls are left to agent reviews. */
export const RULE_CHECKS = {
  'run.failed': 'fail',
  'run.superseded': 'info',
  'run.foreign-host': 'info',
  'run.harness-exited': 'warn',
  'run.stale': 'warn',
  'run.no-metrics': 'warn',
  'run.primary-metric-missing': 'warn',
  'run.non-finite': 'warn',
  'run.seed-split': 'warn',
  'repro.commit-unknown': 'info',
  'repro.code-not-project': 'warn',
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
export const MAX_RUNS = 6
const MAX_SAMPLES = 50
const MAX_EVIDENCE = 12
const MAX_TEXT = 2000
export const INACTIVE_STATES = new Set(['failed', 'cancelled'])

export function projectRelative(project, target) {
  return path.relative(project, target).split(path.sep).join('/')
}

export async function isFile(target) {
  return lstat(target).then(
    (details) => details.isFile(),
    () => false
  )
}

export function pickField(source, field) {
  let value = source
  for (const key of field.split('.')) {
    value = value && typeof value === 'object' ? value[key] : undefined
  }
  return value ?? null
}

export function manifestEvidence(run, field) {
  return { kind: 'manifest', run: run.ref, field, value: pickField(run.manifest, field) }
}

export function fileEvidence(project, target, line = null) {
  return { kind: 'file', path: projectRelative(project, target), line }
}

export function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

export function durationText(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    return null
  }
  const minutes = Math.round(ms / 60_000)
  if (minutes < 1) {
    return `${Math.round(ms / 1000)} s`
  }
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

export function finding(
  check,
  { experiment, target, runs = [], samples = [], text, evidence = [] }
) {
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

export function metricLabel(metric) {
  return `${metric.split ? `${metric.split} ` : ''}${metric.name}`
}
