import type { z } from 'zod'
import type { ResearchRunAgentStatus } from '../../shared/research/research-run-agent-status'
import {
  researchRunManifestSchema,
  type ResearchRunManifest
} from '../../shared/research/research-run-manifest'
import {
  parseResearchMetricLines,
  summarizeResearchMetricRows
} from '../../shared/research/research-run-metrics'
import {
  formatResearchRunName,
  type ResearchRunLocation
} from '../../shared/research/research-run-reference'
import type { ResearchRunWatch } from '../../shared/research/research-run-watch'
import type { ResearchSlurmRunLink } from '../../shared/research/research-slurm-run-links'
import type { ResearchRunStatusParams } from '../../shared/rpc-contract/research-run-params'
import { readResearchRunFiles } from './research-run-files'
import { researchRunDir, resolveResearchRun } from './research-run-resolve'
import { summarizeResearchRunWatch } from './research-run-agent-api'
import { readResearchRunWatches } from './research-run-watch-store'

const STATUS_METRICS_BYTES = 512 * 1024
const STATUS_LOG_BYTES = 16 * 1024
const STATUS_LOG_LINES = 30

function sameRun(watch: ResearchRunWatch, location: ResearchRunLocation): boolean {
  return (
    watch.run.targetId === location.targetId &&
    watch.run.projectPath === location.projectPath &&
    watch.run.experiment === location.experiment &&
    watch.run.runId === location.runId
  )
}

function parseManifest(content: string | null): ResearchRunManifest | null {
  if (!content) {
    return null
  }
  try {
    const result = researchRunManifestSchema.safeParse(JSON.parse(content))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function statusJob(
  manifest: ResearchRunManifest | null,
  link: ResearchSlurmRunLink | null
): ResearchRunAgentStatus['job'] {
  if (link) {
    return {
      scheduler: 'slurm',
      jobId: link.jobId,
      state: link.state,
      reason: link.reason,
      exitCode: link.exitCode,
      observedAt: link.observedAt,
      tracked: link.closedAt === null
    }
  }
  const job = manifest?.job
  return job
    ? {
        scheduler: job.scheduler,
        jobId: job.jobId,
        state: job.state,
        reason: job.reason ?? null,
        exitCode: job.exitCode ?? null,
        observedAt: job.observedAt,
        tracked: false
      }
    : null
}

function directionsFrom(manifest: ResearchRunManifest | null) {
  return Object.fromEntries(
    Object.entries(manifest?.metrics?.definitions ?? {}).map(([name, definition]) => [
      name,
      definition.direction ?? null
    ])
  )
}

export async function readResearchRunStatus(
  params: z.infer<typeof ResearchRunStatusParams>
): Promise<ResearchRunAgentStatus> {
  const { location, hostLabel, link } = await resolveResearchRun(params)
  const read = await readResearchRunFiles(location, {
    metricsFrom: 'tail',
    logFrom: 'tail',
    maxBytes: STATUS_METRICS_BYTES,
    logMaxBytes: STATUS_LOG_BYTES
  })
  if (!read.ok) {
    throw new Error(`Could not read the Run: ${read.message}`)
  }
  const warnings: string[] = []
  if (!read.read.manifest) {
    warnings.push(`No run.json in ${researchRunDir(location, read.read.recordRoot)}.`)
  }
  const manifest = parseManifest(read.read.manifest?.content ?? null)
  if (read.read.manifest && !manifest) {
    warnings.push('run.json is not a valid version 1 Run manifest.')
  }
  const metrics = parseResearchMetricLines(read.read.metrics.text)
  const lastRow = metrics.rows.at(-1) ?? null
  const logLines = read.read.log.text.split(/\r?\n/).filter((line) => line.length > 0)
  const logTail = logLines.slice(-STATUS_LOG_LINES)
  const watches = (await readResearchRunWatches().catch(() => null))?.watches ?? []
  const code = manifest?.code
  return {
    run: {
      name: formatResearchRunName(location),
      host: hostLabel ?? 'local',
      projectPath: location.projectPath,
      dir: researchRunDir(location, read.read.recordRoot)
    },
    execution: manifest?.execution
      ? {
          state: manifest.execution.state,
          observedAt: manifest.execution.observedAt,
          exitCode: manifest.execution.exitCode ?? null,
          source: manifest.execution.source ?? null
        }
      : null,
    job: statusJob(manifest, link),
    launch: manifest?.launch ?? null,
    code: code
      ? { commit: code.commit ?? null, dirty: code.dirty ?? null, capturePhase: code.capturePhase }
      : null,
    metrics: {
      rows: metrics.rows.length,
      malformed: metrics.malformed,
      partial: read.read.metrics.from > 0,
      last: lastRow ? { step: lastRow.step, split: lastRow.split, metrics: lastRow.metrics } : null,
      series: summarizeResearchMetricRows(metrics.rows, directionsFrom(manifest))
    },
    log: {
      lines: logTail.map((line) => line.slice(0, 500)),
      truncated: read.read.log.from > 0 || logLines.length > logTail.length
    },
    watches: watches
      .filter((watch) => sameRun(watch, location) && watch.state === 'active')
      .map(summarizeResearchRunWatch),
    warnings
  }
}
