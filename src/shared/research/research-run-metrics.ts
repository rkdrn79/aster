/** One metrics.jsonl event; `nonFinite` names metrics logged as NaN or ±Infinity. */
export type ResearchMetricRow = {
  step: number | null
  split: string | null
  metrics: Record<string, number>
  nonFinite: string[]
}

const NON_METRIC_KEYS = new Set([
  'schemaVersion',
  'runId',
  'step',
  'epoch',
  'split',
  'time',
  'timestamp',
  'wallTime',
  'metrics'
])
const NON_FINITE_TEXT = /^[+-]?(?:nan|inf|infinity)$/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Why: Python's json.dumps writes bare NaN/Infinity, which JSON.parse rejects; those are the
// lines a NaN watch exists to catch.
function parseJsonAllowingNonFinite(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    const quoted = line.replace(
      /([:,[]\s*)(-?Infinity|NaN)(?=\s*[,\]}])/g,
      (_match, prefix: string, token: string) => `${prefix}"${token}"`
    )
    return JSON.parse(quoted)
  }
}

function readMetricValues(
  source: Record<string, unknown>,
  skip: ReadonlySet<string>
): { metrics: Record<string, number>; nonFinite: string[] } {
  const metrics: Record<string, number> = {}
  const nonFinite: string[] = []
  for (const [name, value] of Object.entries(source)) {
    if (skip.has(name)) {
      continue
    }
    if (typeof value === 'number') {
      if (Number.isFinite(value)) {
        metrics[name] = value
      } else {
        nonFinite.push(name)
      }
    } else if (typeof value === 'string' && NON_FINITE_TEXT.test(value.trim())) {
      nonFinite.push(name)
    }
  }
  return { metrics, nonFinite }
}

export function parseResearchMetricLine(line: string): ResearchMetricRow | null {
  let parsed: unknown
  try {
    parsed = parseJsonAllowingNonFinite(line)
  } catch {
    return null
  }
  if (!isRecord(parsed)) {
    return null
  }
  const nested = parsed.metrics
  const { metrics, nonFinite } = isRecord(nested)
    ? readMetricValues(nested, new Set())
    : readMetricValues(parsed, NON_METRIC_KEYS)
  return {
    step: typeof parsed.step === 'number' && Number.isFinite(parsed.step) ? parsed.step : null,
    split: typeof parsed.split === 'string' ? parsed.split : null,
    metrics,
    nonFinite
  }
}

/** Complete lines only: a trailing partial line is still being written. */
export function parseResearchMetricLines(text: string): {
  rows: ResearchMetricRow[]
  malformed: number
} {
  const rows: ResearchMetricRow[] = []
  let malformed = 0
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) {
      continue
    }
    const row = parseResearchMetricLine(line)
    if (row) {
      rows.push(row)
    } else {
      malformed += 1
    }
  }
  return { rows, malformed }
}

export type ResearchMetricDirection = 'minimize' | 'maximize'

export type ResearchMetricSeriesSummary = {
  name: string
  split: string | null
  last: number
  lastStep: number | null
  min: number
  max: number
  /** From run.json's metric definitions; null when the Run did not record one. */
  direction: ResearchMetricDirection | null
  best: number | null
}

const MAX_SERIES = 16

export function summarizeResearchMetricRows(
  rows: readonly ResearchMetricRow[],
  directions: Readonly<Record<string, ResearchMetricDirection | null | undefined>> = {}
): ResearchMetricSeriesSummary[] {
  const series = new Map<string, ResearchMetricSeriesSummary>()
  for (const row of rows) {
    for (const [name, value] of Object.entries(row.metrics)) {
      const key = JSON.stringify([row.split, name])
      const current = series.get(key)
      if (!current && series.size >= MAX_SERIES) {
        continue
      }
      const direction = directions[name] ?? null
      series.set(key, {
        name,
        split: row.split,
        last: value,
        lastStep: row.step,
        min: Math.min(current?.min ?? value, value),
        max: Math.max(current?.max ?? value, value),
        direction,
        best: null
      })
    }
  }
  return [...series.values()].map((entry) => ({
    ...entry,
    best:
      entry.direction === 'minimize' ? entry.min : entry.direction === 'maximize' ? entry.max : null
  }))
}

export function formatResearchMetricValues(metrics: Readonly<Record<string, number>>): string {
  return Object.entries(metrics)
    .slice(0, 8)
    .map(([name, value]) => `${name}=${Number(value.toPrecision(6))}`)
    .join(', ')
}
