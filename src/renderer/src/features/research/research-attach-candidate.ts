import type {
  ExperimentRecord,
  ResearchRunRecord
} from '../../../../shared/research/research-records'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { RunObservation } from './research-source-reader'

type ResearchAttachCandidateInput = {
  experiment: ExperimentRecord | undefined
  name: string
  sourcePath: string
  format: 'csv' | 'jsonl'
  csvXColumn: string | null | undefined
  csvMetricColumns: string[] | undefined
  preview: RunObservation | null
  logPath: string
  configPath: string
  outputsPath: string
  manifestPath: string
}

export function researchAttachCandidate(
  input: ResearchAttachCandidateInput
): ResearchRunRecord | null {
  const {
    experiment,
    name,
    sourcePath,
    format,
    csvXColumn,
    csvMetricColumns,
    preview,
    logPath,
    configPath,
    outputsPath,
    manifestPath
  } = input
  if (!experiment || !sourcePath.trim() || !name.trim()) {
    return null
  }
  return {
    id: createBrowserUuid(),
    experimentId: experiment.id,
    name: name.trim(),
    hostId: experiment.hostId,
    workspaceId: experiment.workspaceId,
    workspacePath: experiment.workspacePath,
    sourcePath: sourcePath.trim(),
    format,
    csvMapping:
      format === 'csv' && (csvXColumn !== undefined || csvMetricColumns !== undefined)
        ? {
            xColumn: csvXColumn === undefined ? (preview?.csvSelectedXColumn ?? null) : csvXColumn,
            metricColumns:
              csvMetricColumns ??
              preview?.csvSelectedMetricColumns.filter((column) => column !== csvXColumn) ??
              []
          }
        : undefined,
    logPath: logPath.trim() || null,
    configPath: configPath.trim() || null,
    outputsPath: outputsPath.trim() || null,
    manifestPath: manifestPath.trim() || null,
    execution: 'unknown',
    reportedBy: 'unavailable',
    observedAt: null,
    createdAt: new Date().toISOString()
  }
}
