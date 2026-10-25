import type {
  ResearchProjectFile,
  ResearchProjectMetricLast,
  ResearchProjectMetricPoint,
  ResearchProjectMetricSeries
} from '../../shared/research/research-project-api'
import type { ResearchRunManifest } from '../../shared/research/research-run-manifest'
import {
  parseResearchMetricLine,
  parseResearchMetricLines,
  type ResearchMetricDirection
} from '../../shared/research/research-run-metrics'
import {
  readResearchProjectBytes,
  resolveResearchProjectPath,
  unreadableResearchProjectFile,
  type ResearchProjectRoot
} from './research-project-files'

// Why a cap: every distinct metric/split holds its points in memory while a file is grouped.
const MAX_TRACKED_SERIES = 64

type MetricDefinitions = NonNullable<NonNullable<ResearchRunManifest['metrics']>['definitions']>

type GroupedSeries = { name: string; split: string | null; points: ResearchProjectMetricPoint[] }

export type GroupedResearchMetrics = {
  rows: number
  malformedLines: number
  /** In order of first appearance. */
  series: GroupedSeries[]
  /** Distinct series past the tracking cap; their points were not kept. */
  untrackedSeries: number
}

/** metrics.jsonl text read from byte `offset`, grouped by metric and split in file order. */
function groupResearchMetricText(text: string, offset: number): GroupedResearchMetrics {
  let body = text
  if (offset > 0) {
    // Why: a read that starts mid-file starts mid-row; that fragment is not a malformed row.
    const firstBreak = body.indexOf('\n')
    body = firstBreak === -1 ? '' : body.slice(firstBreak + 1)
  }
  const lastBreak = body.lastIndexOf('\n')
  const parsed = parseResearchMetricLines(body.slice(0, lastBreak + 1))
  // Why: bytes after the last newline may be a row still being written; kept only once it parses.
  const pending = body.slice(lastBreak + 1)
  const pendingRow = pending.trim() ? parseResearchMetricLine(pending) : null
  const rows = pendingRow ? [...parsed.rows, pendingRow] : parsed.rows

  const series = new Map<string, GroupedSeries>()
  const untracked = new Set<string>()
  for (const row of rows) {
    for (const [name, value] of Object.entries(row.metrics)) {
      const key = JSON.stringify([name, row.split])
      let entry = series.get(key)
      if (!entry) {
        if (series.size >= MAX_TRACKED_SERIES) {
          untracked.add(key)
          continue
        }
        entry = { name, split: row.split, points: [] }
        series.set(key, entry)
      }
      entry.points.push({ step: row.step, value })
    }
  }
  return {
    rows: rows.length,
    malformedLines: parsed.malformed,
    series: [...series.values()],
    untrackedSeries: untracked.size
  }
}

function definedDirection(
  definitions: MetricDefinitions,
  name: string
): ResearchMetricDirection | null {
  return Object.hasOwn(definitions, name) ? (definitions[name]?.direction ?? null) : null
}

// Why defined first: those are the metrics the Run said matter, so they survive the cap (as in
// the harness's `context`). Then by name and split, so the order is stable between reads.
function rankSeries(series: readonly GroupedSeries[], definitions: MetricDefinitions) {
  const key = (entry: GroupedSeries): string =>
    `${Object.hasOwn(definitions, entry.name) ? 0 : 1}${entry.name}\0${entry.split ?? ''}`
  return [...series].sort((left, right) => (key(left) < key(right) ? -1 : 1))
}

/** The last value of up to `limit` series. */
export function lastResearchMetricValues(
  grouped: GroupedResearchMetrics,
  definitions: MetricDefinitions,
  limit: number
): { series: ResearchProjectMetricLast[]; omittedSeries: number } {
  const ranked = rankSeries(grouped.series, definitions)
  return {
    series: ranked.slice(0, limit).flatMap((entry) => {
      const last = entry.points.at(-1)
      return last
        ? [
            {
              name: entry.name,
              split: entry.split,
              last: last.value,
              lastStep: last.step,
              direction: definedDirection(definitions, entry.name)
            }
          ]
        : []
    }),
    omittedSeries: Math.max(0, ranked.length - limit) + grouped.untrackedSeries
  }
}

/** At most `maxPoints` (2 or more) evenly spaced points, always keeping the first and the last. */
function downsamplePoints<T>(points: readonly T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) {
    return [...points]
  }
  const lastIndex = points.length - 1
  const kept: T[] = []
  for (let index = 0; index < maxPoints; index += 1) {
    const point = points[Math.round((index * lastIndex) / (maxPoints - 1))]
    if (point !== undefined) {
      kept.push(point)
    }
  }
  return kept
}

/** Up to `maxSeries` series, each downsampled to `maxPoints`. */
export function downsampledResearchMetricSeries(
  grouped: GroupedResearchMetrics,
  definitions: MetricDefinitions,
  maxSeries: number,
  maxPoints: number
): { series: ResearchProjectMetricSeries[]; omittedSeries: number } {
  const ranked = rankSeries(grouped.series, definitions)
  return {
    series: ranked.slice(0, maxSeries).map((entry) => ({
      name: entry.name,
      split: entry.split,
      direction: definedDirection(definitions, entry.name),
      count: entry.points.length,
      points: downsamplePoints(entry.points, maxPoints)
    })),
    omittedSeries: Math.max(0, ranked.length - maxSeries) + grouped.untrackedSeries
  }
}

export type ResearchProjectMetricsRead = {
  bytes: number
  partial: boolean
  grouped: GroupedResearchMetrics
}

/** The newest `maxBytes` of a JSONL metrics file, grouped; `onRead` is charged the bytes read. */
export async function readResearchProjectMetrics(
  root: ResearchProjectRoot,
  relativePath: string,
  maxBytes: number,
  onRead?: (bytes: number) => void
): Promise<ResearchProjectFile<ResearchProjectMetricsRead>> {
  if (!relativePath.toLowerCase().endsWith('.jsonl')) {
    return { status: 'unreadable', reason: `Only JSONL metrics are read: ${relativePath}` }
  }
  try {
    // Why the end: on a file over the cap, the newest rows are the ones a reader is waiting for.
    const read = await readResearchProjectBytes(
      await resolveResearchProjectPath(root, relativePath),
      maxBytes,
      'end'
    )
    if (!read) {
      return { status: 'absent' }
    }
    onRead?.(read.bytes.length)
    return {
      status: 'present',
      value: {
        bytes: read.size,
        partial: read.offset > 0,
        grouped: groupResearchMetricText(read.bytes.toString('utf8'), read.offset)
      }
    }
  } catch (error) {
    return unreadableResearchProjectFile(error)
  }
}
