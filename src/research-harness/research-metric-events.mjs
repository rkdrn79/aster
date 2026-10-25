import { createReadStream } from 'node:fs'
import { appendFile, lstat } from 'node:fs/promises'
import readline from 'node:readline'
import { HarnessError } from './research-harness-error.mjs'

export const METRIC_LINE_PREFIX = 'ASTER_METRIC '
export const MAX_METRIC_LINE_BYTES = 1024 * 1024
const MAX_METRICS_FILE_BYTES = 50 * 1024 * 1024
const metricDirections = new Set(['minimize', 'maximize'])

export function checkedMetricName(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 200 || /[\0=]/u.test(name)) {
    throw new HarnessError('invalid_argument', `Invalid metric name: ${name}`)
  }
  return name.trim()
}

export function parseMetricValue(text) {
  if (text === 'null') {
    return null
  }
  const value = Number(text)
  if (text.trim() === '' || !Number.isFinite(value)) {
    throw new HarnessError('invalid_argument', `Metric value must be a finite number: ${text}`)
  }
  return value
}

/** `loss:minimize` or `acc:maximize:%` → manifest metric definitions. */
export function parseMetricDefinitions(specs) {
  if (!specs?.length) {
    return null
  }
  const definitions = {}
  for (const spec of specs) {
    const [name, direction, ...unitParts] = spec.split(':')
    const unit = unitParts.join(':')
    if (!metricDirections.has(direction)) {
      throw new HarnessError(
        'invalid_argument',
        `Metric definition must look like name:minimize or name:maximize[:unit]: ${spec}`
      )
    }
    definitions[checkedMetricName(name)] = { direction, ...(unit ? { unit } : {}) }
  }
  return definitions
}

function finiteMetrics(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null
  }
  const metrics = {}
  for (const [name, value] of Object.entries(source)) {
    if (value === null || (typeof value === 'number' && Number.isFinite(value))) {
      metrics[name] = value
    }
  }
  return Object.keys(metrics).length ? metrics : null
}

/** Builds a schemaVersion 1 event, or null when the candidate has no usable metric values. */
export function metricEvent(runId, candidate, observedAt) {
  const metrics = finiteMetrics(candidate?.metrics)
  if (!metrics) {
    return null
  }
  const step = candidate.step
  const split = candidate.split
  const timestamp = candidate.timestamp ?? candidate.time
  return {
    schemaVersion: 1,
    runId,
    ...(typeof step === 'number' && Number.isFinite(step) ? { step } : {}),
    ...(typeof split === 'string' && split.trim() ? { split: split.trim() } : {}),
    timestamp: typeof timestamp === 'string' && timestamp ? timestamp : observedAt,
    metrics
  }
}

/**
 * Protocol: `ASTER_METRIC {"step":..,"split":..,"metrics":{..}}`, or (stdout only) a bare JSON
 * object line with a `metrics` object.
 */
export function metricCandidateFromLine(line, { allowBareJson }) {
  if (line.length > MAX_METRIC_LINE_BYTES) {
    return null
  }
  let payload = null
  if (line.startsWith(METRIC_LINE_PREFIX)) {
    payload = line.slice(METRIC_LINE_PREFIX.length)
  } else if (allowBareJson && line.startsWith('{') && line.includes('"metrics"')) {
    payload = line
  }
  if (payload === null) {
    return null
  }
  try {
    const parsed = JSON.parse(payload)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function appendMetricEvent(target, event) {
  await appendFile(target, `${JSON.stringify(event)}\n`)
}

function seriesKey(metric, split) {
  return `${metric}\0${split ?? ''}`
}

/** Streams a run's metrics.jsonl into per metric/split point lists, in file order. */
export async function readMetricSeries(target) {
  const details = await lstat(target)
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new HarnessError('invalid_layout', `Metrics file is not a regular file: ${target}`)
  }
  if (details.size > MAX_METRICS_FILE_BYTES) {
    throw new HarnessError('too_large', `Metrics file exceeds 50 MiB: ${target}`)
  }
  const series = new Map()
  let rows = 0
  let invalidRows = 0
  const source = readline.createInterface({
    input: createReadStream(target, { encoding: 'utf8' }),
    crlfDelay: Infinity
  })
  for await (const line of source) {
    if (!line.trim()) {
      continue
    }
    rows += 1
    let event
    try {
      event = JSON.parse(line)
    } catch {
      invalidRows += 1
      continue
    }
    const metrics = event?.metrics
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
      invalidRows += 1
      continue
    }
    const split = typeof event.split === 'string' ? event.split : null
    const step = typeof event.step === 'number' && Number.isFinite(event.step) ? event.step : null
    for (const [metric, value] of Object.entries(metrics)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        continue
      }
      const key = seriesKey(metric, split)
      if (!series.has(key)) {
        series.set(key, { metric, split, points: [] })
      }
      series.get(key).points.push({ step, value, row: rows })
    }
  }
  return { rows, invalidRows, series: [...series.values()] }
}

function extremePoint(points, direction) {
  let best = null
  for (const point of points) {
    if (!best || (direction === 'minimize' ? point.value < best.value : point.value > best.value)) {
      best = point
    }
  }
  return best
}

export function summarizeSeries(entry, direction) {
  const last = entry.points.at(-1)
  const best = direction ? extremePoint(entry.points, direction) : null
  return {
    name: entry.metric,
    split: entry.split,
    count: entry.points.length,
    direction: direction ?? null,
    last: last.value,
    lastStep: last.step,
    best: best?.value ?? null,
    bestStep: best?.step ?? null,
    min: extremePoint(entry.points, 'minimize').value,
    max: extremePoint(entry.points, 'maximize').value
  }
}

export function summarizeMetricSeries(series, definitions = {}) {
  return series.map((entry) => summarizeSeries(entry, definitions?.[entry.metric]?.direction))
}

/**
 * Picks one value for claim evidence. A null split matches the metric only when it was
 * recorded under exactly one split, so a claim never silently picks train over val.
 */
export function selectMetricValue(series, { metric, split, select, step, direction }) {
  const candidates = series.filter(
    (entry) => entry.metric === metric && (split === null || entry.split === split)
  )
  if (candidates.length === 0) {
    return { error: `metric ${metric}${split ? ` (split ${split})` : ''} has no numeric values` }
  }
  if (candidates.length > 1) {
    const splits = candidates.map((entry) => entry.split ?? '(none)').join(', ')
    return { error: `metric ${metric} has several splits (${splits}); pass a split` }
  }
  const [entry] = candidates
  let point = null
  if (select === 'last') {
    point = entry.points.at(-1)
  } else if (select === 'best') {
    if (!metricDirections.has(direction)) {
      return { error: `best ${metric} needs a direction (minimize or maximize)` }
    }
    point = extremePoint(entry.points, direction)
  } else if (select === 'step') {
    point = entry.points.findLast((candidate) => candidate.step === step) ?? null
    if (!point) {
      return { error: `metric ${metric} has no value at step ${step}` }
    }
  }
  return { value: point.value, step: point.step, split: entry.split }
}
