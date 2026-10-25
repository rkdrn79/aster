import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import { parseCsv } from '@/components/editor/csv/csv-parse'
import {
  parseResearchRunManifest,
  type ResearchRunManifest
} from '../../../../shared/research/research-run-manifest'
import { readResearchTextFile } from './research-file-reader'

export { readResearchTextFile, readResearchTextTail } from './research-file-reader'
export type { ResearchTextTail } from './research-file-reader'

const MAX_MANIFEST_BYTES = 1024 * 1024

export type MetricEvent = { x: number; metric: string; split: string; value: number }
export type ResearchSourceAnchor = { characters: number; sha256: string }
export type RunObservation = {
  events: MetricEvent[]
  metrics: string[]
  xLabel: string
  errorRows: number
  incompleteLastLine: boolean
  observedAt: string
  sourceSize: number
  sourceRunId: string | null
  sourceAnchor: ResearchSourceAnchor | null
  csvColumns: string[] | null
  csvSelectedXColumn: string | null
  csvSelectedMetricColumns: string[]
}

export function researchSourceIdentityMismatch(
  run: ResearchRunRecord,
  observation: RunObservation
): string | null {
  if (run.format === 'jsonl' && run.sourceRunId && observation.sourceRunId !== run.sourceRunId) {
    return 'This metrics file now belongs to a different run. Attach it as a new run.'
  }
  if (
    run.sourceAnchor &&
    (observation.sourceAnchor?.characters !== run.sourceAnchor.characters ||
      observation.sourceAnchor.sha256 !== run.sourceAnchor.sha256)
  ) {
    return 'This metrics file was replaced since it was attached. Attach it as a new run.'
  }
  return null
}

async function sourceAnchor(
  content: string,
  characters: number
): Promise<ResearchSourceAnchor | null> {
  if (!content.length) {
    return null
  }
  const prefix = content.slice(0, characters)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(prefix))
  return {
    characters: prefix.length,
    sha256: Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      ''
    )
  }
}

function parseJsonl(content: string): RunObservation {
  const lines = content.split(/\r?\n/)
  let incompleteLastLine = false
  const events: MetricEvent[] = []
  let errorRows = 0
  let hasStep = false
  let missingStep = false
  let sourceRunId: string | null = null
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) {
      continue
    }
    if (line.length > 1024 * 1024) {
      errorRows += 1
      continue
    }
    try {
      const row: unknown = JSON.parse(line)
      if (
        !row ||
        typeof row !== 'object' ||
        !('metrics' in row) ||
        !('runId' in row) ||
        !('schemaVersion' in row)
      ) {
        errorRows += 1
        continue
      }
      if (
        row.schemaVersion !== 1 ||
        typeof row.runId !== 'string' ||
        !row.runId.trim() ||
        (sourceRunId && row.runId !== sourceRunId)
      ) {
        errorRows += 1
        continue
      }
      const metrics = row.metrics
      const step = 'step' in row ? row.step : undefined
      const split = 'split' in row && typeof row.split === 'string' ? row.split : 'unspecified'
      if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
        errorRows += 1
        continue
      }
      sourceRunId = row.runId
      if (typeof step === 'number' && Number.isFinite(step)) {
        hasStep = true
      } else {
        missingStep = true
      }
      for (const [metric, value] of Object.entries(metrics)) {
        if (value === null) {
          continue
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          errorRows += 1
          continue
        }
        events.push({
          x: typeof step === 'number' && Number.isFinite(step) ? step : index + 1,
          metric,
          split,
          value
        })
      }
    } catch {
      if (index === lines.length - 1 && !content.endsWith('\n')) {
        incompleteLastLine = true
      } else {
        errorRows += 1
      }
    }
  }
  return {
    events,
    metrics: [...new Set(events.map((event) => event.metric))],
    xLabel: hasStep ? (missingStep ? 'step (row number where missing)' : 'step') : 'row number',
    errorRows,
    incompleteLastLine: Boolean(incompleteLastLine),
    observedAt: new Date().toISOString(),
    sourceSize: content.length,
    sourceRunId,
    sourceAnchor: null,
    csvColumns: null,
    csvSelectedXColumn: null,
    csvSelectedMetricColumns: []
  }
}

function parseResearchCsv(
  content: string,
  mapping: ResearchRunRecord['csvMapping']
): RunObservation {
  const { rows } = parseCsv(content, ',', {
    maxCells: 200_000,
    maxColumns: 200,
    maxRecordLength: 1024 * 1024
  })
  const [rawHeader, ...records] = rows
  if (!rawHeader?.length) {
    throw new Error('CSV has no header row.')
  }
  const header = rawHeader.map((name) => name.trim())
  if (header.some((name) => !name) || new Set(header).size !== header.length) {
    throw new Error('CSV headers must be non-empty and unique.')
  }
  const xColumn =
    mapping === undefined
      ? (header.find((name) => name.toLowerCase() === 'step') ?? null)
      : (mapping?.xColumn ?? null)
  const xIndex = xColumn === null ? -1 : header.indexOf(xColumn)
  if (xColumn !== null && xIndex === -1) {
    throw new Error(`CSV x-axis column is missing: ${xColumn}`)
  }
  const metricColumns = mapping
    ? mapping.metricColumns.filter((name) => name !== xColumn)
    : header.filter((_, column) => {
        if (column === xIndex) {
          return false
        }
        const firstValue = records
          .slice(0, 100)
          .map((row) => row[column]?.trim())
          .find(Boolean)
        return firstValue !== undefined && Number.isFinite(Number(firstValue))
      })
  if (metricColumns.some((name) => !header.includes(name))) {
    throw new Error('A selected CSV metric column is missing from the file.')
  }
  const selectedColumns = metricColumns.map((metric) => ({
    metric,
    column: header.indexOf(metric)
  }))
  const events: MetricEvent[] = []
  let errorRows = 0
  records.forEach((row, index) => {
    if (row.length === 1 && row[0] === '') {
      return
    }
    const candidate = xIndex !== -1 ? Number(row[xIndex]?.trim() || Number.NaN) : index + 1
    if (!Number.isFinite(candidate)) {
      errorRows += 1
      return
    }
    selectedColumns.forEach(({ metric, column }) => {
      if (!row[column]?.trim()) {
        return
      }
      const value = Number(row[column])
      if (!Number.isFinite(value)) {
        errorRows += 1
        return
      }
      events.push({ x: candidate, metric, split: 'unspecified', value })
    })
  })
  return {
    events,
    metrics: [...new Set(events.map((event) => event.metric))],
    xLabel: xColumn ?? 'row number',
    errorRows,
    incompleteLastLine: false,
    observedAt: new Date().toISOString(),
    sourceSize: content.length,
    sourceRunId: null,
    sourceAnchor: null,
    csvColumns: header,
    csvSelectedXColumn: xColumn,
    csvSelectedMetricColumns: metricColumns
  }
}

export function parseResearchMetrics(
  content: string,
  format: ResearchRunRecord['format'],
  csvMapping?: ResearchRunRecord['csvMapping']
): RunObservation {
  return format === 'jsonl' ? parseJsonl(content) : parseResearchCsv(content, csvMapping)
}

export async function observeResearchRun(run: ResearchRunRecord): Promise<RunObservation> {
  const content = await readResearchTextFile(run, run.sourcePath)
  return {
    ...parseResearchMetrics(content, run.format, run.csvMapping),
    sourceAnchor: await sourceAnchor(content, run.sourceAnchor?.characters ?? content.length)
  }
}

export async function readResearchRunManifest(
  run: ResearchRunRecord
): Promise<ResearchRunManifest | null> {
  if (!run.manifestPath) {
    return null
  }
  return parseResearchRunManifest(
    await readResearchTextFile(run, run.manifestPath, MAX_MANIFEST_BYTES)
  )
}
