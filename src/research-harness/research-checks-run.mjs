import os from 'node:os'
import { createCodeOriginLookup } from './research-code-capture.mjs'
import {
  INACTIVE_STATES,
  durationText,
  fileEvidence,
  finding,
  isFile,
  manifestEvidence,
  metricLabel,
  pickField,
  plural,
  projectRelative
} from './research-checks-common.mjs'
import { HARNESS_SOURCE, harnessLiveness, launchedElsewhere } from './research-run-manifest.mjs'
import { readLogFacts } from './research-run-log-facts.mjs'
import { runAttempts } from './research-run-attempts.mjs'

const STALE_AFTER_MS = 10 * 60_000
// `seed42`, `seed-1`, `seed_0`: a seed recorded where a data split belongs.
const SEED_SPLIT = /^seed[-_ ]?\d+$/iu

/** What every Run check of one Experiment shares: attempts by name and a cached git lookup. */
export function createRunCheckContext(project, runs) {
  return {
    attempts: runAttempts(runs),
    codeOrigin: createCodeOriginLookup(project),
    codeOrigins: new Map()
  }
}

function commitList(runs) {
  const commits = [...new Set(runs.map((run) => String(run.manifest.code.commit).slice(0, 7)))]
  return `${commits.slice(0, 3).join(', ')}${commits.length > 3 ? ', …' : ''}`
}

/**
 * One `repro.code-not-project` finding per cause among an Experiment's Runs, after runFindings
 * has seen them all: Runs launched inside one nested repository, or commits not in the project.
 */
export function codeOriginFindings(slug, context) {
  return [...context.codeOrigins.values()].map(({ nested, runs }) =>
    finding('repro.code-not-project', {
      experiment: slug,
      target: `${slug}:${nested ? `nested:${nested}` : 'unknown-commit'}`,
      runs: runs.map((run) => run.ref),
      text: nested
        ? `${plural(runs.length, 'Run')} launched inside the nested repository ${nested} recorded its HEAD (${commitList(runs)}) as code.commit, not the project's; their project commit and uncommitted changes are unknown`
        : `${plural(runs.length, 'Run')} record a code.commit (${commitList(runs)}) that is not in this project's git history; the project code they used is unknown`,
      evidence: runs.flatMap((run) => [
        manifestEvidence(run, 'code.commit'),
        manifestEvidence(run, 'launch.cwd')
      ])
    })
  )
}

function hasPrimaryMetric(run, metric) {
  return run.metrics.series.some(
    (entry) =>
      entry.metric === metric.name && (metric.split === null || entry.split === metric.split)
  )
}

/**
 * A Run captured before `code.nested` existed recorded the HEAD of whatever repository held its
 * cwd. Null when the record is fine or nothing can tell.
 */
async function codeOrigin(context, manifest) {
  const code = manifest.code
  if (
    !code?.commit ||
    code.capturePhase !== 'at_launch' ||
    manifest.launch?.by !== HARNESS_SOURCE ||
    Array.isArray(code.nested)
  ) {
    return null
  }
  const nested = await context.codeOrigin.nestedRepositoryFor(manifest.launch?.cwd)
  if (nested) {
    return { nested }
  }
  return (await context.codeOrigin.commitInProject(code.commit)) === false ? { nested: null } : null
}

export async function runFindings(project, run, brief, context) {
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
    const outcome =
      state === 'cancelled'
        ? `Cancelled${after}`
        : exitCode === null
          ? `Failed${after}`
          : `Exited with code ${exitCode}${after}`
    // Why not a status change: only the user accepts or dismisses; this is what the records show.
    const retry = context.attempts.get(ref)?.succeededLater ?? null
    add(retry ? 'run.superseded' : 'run.failed', {
      ...(retry ? { runs: [ref, retry] } : {}),
      text: retry ? `${outcome}; a later attempt with the same name, ${retry}, succeeded` : outcome,
      evidence: [
        manifestEvidence(run, 'execution.state'),
        ...(exitCode === null ? [] : [manifestEvidence(run, 'execution.exitCode')]),
        ...(manifest.launch?.signal ? [manifestEvidence(run, 'launch.signal')] : []),
        ...(log?.tail ? [{ kind: 'log', run: ref, ...log.tail }] : [])
      ]
    })
  }

  const recordedOn = launchedElsewhere(manifest)
  if (recordedOn) {
    const lastSeen = durationText(Date.now() - Date.parse(manifest.execution?.observedAt ?? ''))
    add('run.foreign-host', {
      text: `Recorded on ${recordedOn}; this host (${os.hostname()}) can't observe it because its folder ${manifest.launch?.cwd ?? '(not recorded)'} is not here${
        state === 'running' && lastSeen ? `. It was last seen running ${lastSeen} ago` : ''
      }`,
      evidence: [manifestEvidence(run, 'launch.host'), manifestEvidence(run, 'launch.cwd')]
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
  if (state === 'running' && !exited && !recordedOn && Date.now() - observedAt > STALE_AFTER_MS) {
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

  const seedSplits = [
    ...new Set(
      run.metrics.series.map((entry) => entry.split).filter((split) => SEED_SPLIT.test(split ?? ''))
    )
  ]
  if (seedSplits.length) {
    add('run.seed-split', {
      text: `Metrics use seed-like split names (${seedSplits.slice(0, 4).join(', ')}); a split names data such as train, val or test. Put the seed in config.json or the Run name, and record each rerun as its own Run`,
      evidence: metricsFile
    })
  }

  const code = manifest.code
  const origin = await codeOrigin(context, manifest)
  if (origin) {
    // Why grouped: one copied project had 72 such Runs; one finding per cause is enough to act on.
    const key = origin.nested ?? ''
    const group = context.codeOrigins.get(key) ?? { nested: origin.nested, runs: [] }
    group.runs.push(run)
    context.codeOrigins.set(key, group)
  }
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
