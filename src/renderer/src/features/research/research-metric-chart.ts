import type { MetricEvent } from './research-source-reader'

export type ChartPoint = { x: number; value: number }

/** Splits a series where x goes backwards (a resumed or restarted run), so resets never join. */
export function chartSegments(events: MetricEvent[]): MetricEvent[][] {
  const result: MetricEvent[][] = []
  for (const event of events) {
    const current = result.at(-1)
    const previous = current?.at(-1)
    if (!current || !previous || event.x < previous.x) {
      result.push([event])
    } else {
      current.push(event)
    }
  }
  return result
}

export function lastEventAtRepeatedX(events: MetricEvent[]): MetricEvent[] {
  const result: MetricEvent[] = []
  for (const event of events) {
    if (result.at(-1)?.x === event.x) {
      result[result.length - 1] = event
    } else {
      result.push(event)
    }
  }
  return result
}

/** Keeps each bucket's first, lowest, highest and last point so spikes survive downsampling. */
export function downsampleForDisplay<T extends ChartPoint>(points: T[], buckets = 250): T[] {
  if (points.length <= 1000) {
    return points
  }
  const stride = Math.ceil(points.length / buckets)
  const selected: T[] = []
  for (let index = 0; index < points.length; index += stride) {
    const bucket = points.slice(index, index + stride)
    const first = bucket[0]
    const last = bucket.at(-1)
    if (!first || !last) {
      continue
    }
    const low = bucket.reduce((best, point) => (point.value < best.value ? point : best), first)
    const high = bucket.reduce((best, point) => (point.value > best.value ? point : best), first)
    selected.push(
      ...[...new Set([first, low, high, last])].sort(
        (a, b) => bucket.indexOf(a) - bucket.indexOf(b)
      )
    )
  }
  return selected
}

/**
 * TensorBoard-style debiased exponential moving average; `weight` 0 returns the input.
 * Non-finite values pass through and do not disturb the running average.
 */
export function emaSmooth<T extends ChartPoint>(points: T[], weight: number): T[] {
  if (weight <= 0) {
    return points
  }
  let average = 0
  let debias = 0
  return points.map((point) => {
    if (!Number.isFinite(point.value)) {
      return point
    }
    average = average * weight + (1 - weight) * point.value
    debias = debias * weight + (1 - weight)
    return { ...point, value: average / debias }
  })
}

/** 1, 2, 5 × 10^n step giving about `count` intervals over the span. */
export function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count)
  if (!Number.isFinite(raw) || raw <= 0) {
    return 1
  }
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / magnitude
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * magnitude
}

/** Evenly spaced round ticks covering [min, max]; the first and last bound the axis. */
export function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return []
  }
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1
    return niceTicks(min - pad, max + pad, count)
  }
  const step = niceStep(max - min, count)
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  // Why the rounding: 0.1 + 0.2 style drift would otherwise print 0.30000000000000004.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Number(value.toFixed(decimals)))
  }
  return ticks
}

/** Powers of ten covering [min, max] (both > 0); 2× and 5× fill in when the span is narrow. */
export function logTicks(min: number, max: number): number[] {
  if (!(min > 0) || !(max > 0)) {
    return []
  }
  const low = Math.floor(Math.log10(min))
  const high = Math.ceil(Math.log10(max))
  const multipliers = high - low <= 2 ? [1, 2, 5] : [1]
  const ticks: number[] = []
  for (let exponent = low; exponent <= high; exponent += 1) {
    for (const multiplier of multipliers) {
      const value = Number((multiplier * 10 ** exponent).toPrecision(12))
      if (value >= 10 ** low && value <= 10 ** high) {
        ticks.push(value)
      }
    }
  }
  return ticks
}

/** A tick label at the precision its tick spacing needs: `0.05`, `250`, `12k`, `1e-4`. */
export function formatTick(value: number, step: number): string {
  if (value === 0) {
    return '0'
  }
  const magnitude = Math.abs(value)
  if (magnitude >= 10_000) {
    const scaled = magnitude >= 1e6 ? [1e6, 'M'] : [1e3, 'k']
    return `${Number((value / Number(scaled[0])).toPrecision(3))}${scaled[1]}`
  }
  if (magnitude < 1e-3) {
    return value.toExponential(0).replace('e+', 'e')
  }
  const decimals = step > 0 ? Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) : 2
  return value.toFixed(Math.min(6, decimals))
}

/** Index of the sorted value closest to `target`; -1 for an empty list. */
export function nearestIndex(sorted: readonly number[], target: number): number {
  if (!sorted.length) {
    return -1
  }
  let low = 0
  let high = sorted.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (sorted[middle] < target) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  if (low > 0 && Math.abs(sorted[low - 1] - target) <= Math.abs(sorted[low] - target)) {
    return low - 1
  }
  return low
}

/** The point at `x` in the latest segment that spans it; null outside every segment. */
export function valueAtX<T extends ChartPoint>(segments: T[][], x: number): T | null {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index]
    const first = segment[0]
    const last = segment.at(-1)
    if (!first || !last || x < first.x || x > last.x) {
      continue
    }
    const found = nearestIndex(
      segment.map((point) => point.x),
      x
    )
    return segment[found] ?? null
  }
  return null
}
