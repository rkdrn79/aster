import { quotePosixShellUnlessPlain } from '../../shared/shell-argument-quoting'
import type { ResearchRunManifest } from '../../shared/research/research-run-manifest'
import { parseResearchMetricLines } from '../../shared/research/research-run-metrics'
import {
  formatResearchRunName,
  type ResearchRunLocation
} from '../../shared/research/research-run-reference'
import type {
  ResearchRunWatch,
  ResearchWatchEvent,
  ResearchWatchRunState
} from '../../shared/research/research-run-watch'
import {
  evaluateResearchWatch,
  researchWatchLastMetrics,
  type ResearchWatchObservation
} from '../../shared/research/research-run-watch-evaluation'
import type { ResearchSlurmRunLink } from '../../shared/research/research-slurm-run-links'
import { localOrchestrationCliCommand } from '../runtime/orchestration/cli-command'
import type { ResearchRunFileStat, ResearchRunFilesRead } from './research-run-files'

export function researchWatchLocation(watch: ResearchRunWatch): ResearchRunLocation {
  return {
    targetId: watch.run.targetId,
    projectPath: watch.run.projectPath,
    experiment: watch.run.experiment,
    runId: watch.run.runId
  }
}

export function researchRunStatusCommand(watch: Pick<ResearchRunWatch, 'run'>): string {
  const server = watch.run.targetId
    ? ` --server ${quotePosixShellUnlessPlain(watch.run.hostLabel ?? watch.run.targetId)}`
    : ''
  return `${localOrchestrationCliCommand()} research status --run ${formatResearchRunName(watch.run)} --project ${quotePosixShellUnlessPlain(watch.run.projectPath)}${server}`
}

/** Linked-job state when Aster tracks the job; it is fresher than the copy inside run.json. */
function jobFacts(
  manifest: ResearchRunManifest | null,
  link: ResearchSlurmRunLink | null
): ResearchWatchObservation['job'] {
  if (link) {
    return { state: link.state, reason: link.reason, exitCode: link.exitCode }
  }
  const job = manifest?.job
  return job
    ? { state: job.state, reason: job.reason ?? null, exitCode: job.exitCode ?? null }
    : null
}

function grew(
  stat: ResearchRunFileStat | null,
  cursor: ResearchRunWatch['metricsCursor']
): boolean {
  return Boolean(stat && (stat.size !== cursor.size || stat.mtimeMs !== cursor.mtimeMs))
}

/** The watch after one read: cursors advanced, conditions evaluated, new events appended. */
export function advanceResearchRunWatch(
  watch: ResearchRunWatch,
  read: ResearchRunFilesRead,
  manifest: ResearchRunManifest | null,
  link: ResearchSlurmRunLink | null,
  now: string
): ResearchRunWatch {
  const metrics = parseResearchMetricLines(read.metrics.text)
  const execution = manifest?.execution
    ? {
        state: manifest.execution.state,
        source: manifest.execution.source ?? null,
        exitCode: manifest.execution.exitCode ?? null
      }
    : null
  const job = jobFacts(manifest, link)
  const observation: ResearchWatchObservation = {
    now,
    execution,
    job,
    newMetricRows: metrics.rows,
    newLogLines: read.log.text.split(/\r?\n/).filter((line) => line.length > 0),
    progressed: grew(read.metrics.stat, watch.metricsCursor) || grew(read.log.stat, watch.logCursor)
  }
  const result = evaluateResearchWatch(watch, observation)
  const runState: ResearchWatchRunState = {
    execution: execution?.state ?? null,
    executionSource: execution?.source ?? null,
    job: job?.state ?? null,
    jobReason: job?.reason ?? null
  }
  const lastMetrics = researchWatchLastMetrics(metrics.rows) ?? watch.lastMetrics
  const deliverable = watch.notify === 'self' && watch.owner !== null
  const events: ResearchWatchEvent[] = result.firings.map((firing) => ({
    ...firing,
    firedAt: now,
    runState,
    lastMetrics,
    notifiedAt: null,
    delivery: {
      state: deliverable ? 'pending' : 'no-owner',
      attempts: 0,
      lastAttemptAt: null,
      deliveredAt: null,
      detail: deliverable ? null : 'no owner agent to wake (desktop notification only)'
    }
  }))
  const fired = [...watch.fired, ...events]
  const firedKeys = new Set(fired.map((event) => event.condition))
  const allFired = watch.conditions.every((condition) => firedKeys.has(condition))
  const ended = result.ended || allFired
  return {
    ...watch,
    state: ended ? 'done' : watch.state,
    endedAt: ended ? now : watch.endedAt,
    metricsCursor: {
      offset: read.metrics.nextOffset,
      size: read.metrics.stat?.size ?? null,
      mtimeMs: read.metrics.stat?.mtimeMs ?? null
    },
    logCursor: {
      offset: read.log.nextOffset,
      size: read.log.stat?.size ?? null,
      mtimeMs: read.log.stat?.mtimeMs ?? null
    },
    lastProgressAt: result.lastProgressAt,
    lastError: null,
    lastMetrics,
    runState,
    fired
  }
}
