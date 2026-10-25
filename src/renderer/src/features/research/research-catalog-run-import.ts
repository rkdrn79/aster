import { createBrowserUuid } from '@/lib/browser-uuid'
import { useAppStore } from '@/store'
import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import { manifestSourceMismatch } from '../../../../shared/research/research-run-manifest'
import { RESEARCH_RECORD_ROOTS } from '../../../../shared/research/research-run-reference'
import { parseHostAuthorityKey } from '../../../../shared/host-authority'
import { metricSnapshotFromObservation } from './research-metric-snapshot'
import { researchFileExists } from './research-file-reader'
import { catalogWorkspacePath, type ProjectCatalog } from './research-project-catalog'
import { useResearchRecords } from './research-records-store'
import { observeResearchRun, readResearchRunManifest } from './research-source-reader'
import { selectResearchWorkspaceContext } from './research-workspace-context'

type CatalogExperiment = ProjectCatalog['experiments'][number]
type CatalogRun = CatalogExperiment['runs'][number]

const OUTPUTS_RECHECK_MS = 60_000
// Why: outputs.jsonl usually appears after training ends, so a miss is retried later.
const outputsMissedAt = new Map<string, number>()

/** The Run folder's outputs.jsonl, when it exists, so Qualitative Compare finds it unasked. */
async function catalogOutputsPath(
  experiment: ExperimentRecord,
  run: CatalogRun
): Promise<string | null> {
  const outputs = catalogWorkspacePath(
    experiment.workspacePath,
    run.manifest.replace(/run\.json$/u, 'outputs.jsonl')
  )
  const missed = outputsMissedAt.get(outputs)
  if (missed !== undefined && Date.now() - missed < OUTPUTS_RECHECK_MS) {
    return null
  }
  const exists = await researchFileExists(experiment, outputs)
  if (exists) {
    outputsMissedAt.delete(outputs)
  } else {
    outputsMissedAt.set(outputs, Date.now())
  }
  return exists ? outputs : null
}

export function catalogRunSourceKey(
  run: Pick<ResearchRunRecord, 'hostId' | 'workspaceId' | 'sourcePath'>
): string {
  return JSON.stringify([run.hostId, run.workspaceId, run.sourcePath])
}

export function catalogRunCandidate(
  experiment: ExperimentRecord,
  entry: CatalogExperiment,
  run: CatalogRun
): ResearchRunRecord {
  // Why both trees: projects set up before ADR-004 keep their Runs under research/.
  const root = RESEARCH_RECORD_ROOTS.find(
    (item) => entry.path === `${item}/experiments/${entry.slug}`
  )
  const prefix = `${root}/experiments/${entry.slug}/runs/${run.id}/`
  if (
    !root ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.slug) ||
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(run.id) ||
    run.manifest !== `${prefix}run.json` ||
    ![`${prefix}metrics.jsonl`, `${prefix}metrics.csv`].includes(run.metrics) ||
    (run.log !== null && run.log !== `${prefix}train.log`) ||
    (run.config !== null && run.config !== `${prefix}config.json`)
  ) {
    throw new Error('Run files are outside the expected run folder')
  }
  const workspacePath = experiment.workspacePath
  return {
    id: createBrowserUuid(),
    experimentId: experiment.id,
    name: run.name,
    hostId: experiment.hostId,
    workspaceId: experiment.workspaceId,
    workspacePath,
    sourcePath: catalogWorkspacePath(workspacePath, run.metrics),
    format: run.metrics.endsWith('.csv') ? 'csv' : 'jsonl',
    logPath: run.log ? catalogWorkspacePath(workspacePath, run.log) : null,
    configPath: run.config ? catalogWorkspacePath(workspacePath, run.config) : null,
    manifestPath: catalogWorkspacePath(workspacePath, run.manifest),
    execution: 'unknown',
    reportedBy: 'unavailable',
    observedAt: null,
    createdAt: new Date().toISOString()
  }
}

export async function syncCatalogRunRecords(
  context: ReturnType<typeof selectResearchWorkspaceContext>,
  catalog: ProjectCatalog
): Promise<string[]> {
  const { hostId, workspaceId, workspacePath } = context
  if (parseHostAuthorityKey(hostId)?.at !== 'local' || !workspaceId || !workspacePath) {
    return []
  }
  const document = useResearchRecords.getState().document
  if (!document) {
    return []
  }
  const attachedBySource = new Map(
    document.runs
      .filter((run) => run.hostId === hostId && run.workspaceId === workspaceId)
      .map((run) => [run.sourcePath, run])
  )
  const existingSources = new Set(attachedBySource.keys())
  const detachedSources = new Set(document.detachedCatalogRunSourceKeys)
  const candidates: ResearchRunRecord[] = []
  // Why: only a never-set path is filled in; null means the user cleared it.
  const foundOutputs = new Map<string, string>()
  const issues: string[] = []
  for (const entry of catalog.experiments) {
    const experiment = document.experiments.find(
      (record) =>
        record.hostId === hostId &&
        record.workspaceId === workspaceId &&
        record.catalogSlug === entry.slug
    )
    if (!experiment) {
      continue
    }
    for (const run of entry.runs) {
      try {
        const candidate = catalogRunCandidate(experiment, entry, run)
        const attached = attachedBySource.get(candidate.sourcePath)
        if (attached && attached.outputsPath === undefined) {
          const outputs = await catalogOutputsPath(experiment, run)
          if (outputs) {
            foundOutputs.set(attached.id, outputs)
          }
        }
        if (
          existingSources.has(candidate.sourcePath) ||
          detachedSources.has(catalogRunSourceKey(candidate))
        ) {
          continue
        }
        const [observation, manifest] = await Promise.all([
          observeResearchRun(candidate),
          readResearchRunManifest(candidate)
        ])
        const mismatch = manifestSourceMismatch(manifest, observation.sourceRunId)
        if (
          !manifest ||
          mismatch ||
          (manifest.externalRunId && manifest.externalRunId !== run.id) ||
          (observation.sourceRunId && observation.sourceRunId !== run.id) ||
          (manifest.metrics?.path &&
            manifest.metrics.path !== run.metrics.slice(run.metrics.lastIndexOf('/') + 1))
        ) {
          throw new Error(mismatch ?? 'Run details do not match its metrics file')
        }
        if (candidate.format === 'csv' && !observation.csvSelectedMetricColumns.length) {
          throw new Error('The CSV has no metric columns')
        }
        existingSources.add(candidate.sourcePath)
        const outputs = await catalogOutputsPath(experiment, run)
        candidates.push({
          ...candidate,
          ...(outputs ? { outputsPath: outputs } : {}),
          sourceRunId: observation.sourceRunId,
          sourceAnchor: observation.sourceAnchor,
          metricSnapshot: metricSnapshotFromObservation(observation),
          csvMapping:
            candidate.format === 'csv'
              ? {
                  xColumn: observation.csvSelectedXColumn,
                  metricColumns: observation.csvSelectedMetricColumns
                }
              : null,
          execution: manifest.execution?.state ?? 'unknown',
          reportedBy: manifest.execution?.reportedBy ?? 'unavailable',
          observedAt: manifest.execution?.observedAt ?? null
        })
      } catch (cause) {
        issues.push(`${run.name}: ${cause instanceof Error ? cause.message : String(cause)}`)
      }
    }
  }
  if (!candidates.length && !foundOutputs.size) {
    return issues
  }
  const identity = JSON.stringify([hostId, workspaceId, workspacePath])
  await useResearchRecords.getState().update((current) => {
    const latest = selectResearchWorkspaceContext(useAppStore.getState())
    if (JSON.stringify([latest.hostId, latest.workspaceId, latest.workspacePath]) !== identity) {
      return current
    }
    const attached = new Set(
      current.runs
        .filter((run) => run.hostId === hostId && run.workspaceId === workspaceId)
        .map((run) => run.sourcePath)
    )
    const detached = new Set(current.detachedCatalogRunSourceKeys)
    const missing = candidates.filter((candidate) => {
      if (
        attached.has(candidate.sourcePath) ||
        detached.has(catalogRunSourceKey(candidate)) ||
        !current.experiments.some((experiment) => experiment.id === candidate.experimentId)
      ) {
        return false
      }
      attached.add(candidate.sourcePath)
      return true
    })
    let outputsChanged = false
    const runs = current.runs.map((run) => {
      const outputs = foundOutputs.get(run.id)
      if (!outputs || run.outputsPath !== undefined) {
        return run
      }
      outputsChanged = true
      return { ...run, outputsPath: outputs }
    })
    return missing.length || outputsChanged ? { ...current, runs: [...runs, ...missing] } : current
  })
  return issues
}
