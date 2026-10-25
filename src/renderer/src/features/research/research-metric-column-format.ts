// One precision per metric column, so 27.09, 27.29 and 27.4922 never sit side by side.

const MAX_DECIMALS = 4

/** Decimals that show four significant digits of the column's largest magnitude. */
export function metricColumnDecimals(values: Iterable<number>): number {
  let largest = 0
  for (const value of values) {
    if (Number.isFinite(value)) {
      largest = Math.max(largest, Math.abs(value))
    }
  }
  if (largest === 0) {
    return 2
  }
  const integerDigits = Math.floor(Math.log10(largest)) + 1
  return Math.min(MAX_DECIMALS, Math.max(0, 4 - integerDigits))
}

/** `27.09`, `0.8583`; NaN/Infinity read as `—` rather than a misleading number. */
export function formatMetricInColumn(value: number, decimals: number): string {
  return Number.isFinite(value) ? value.toFixed(decimals) : '—'
}

/** `+0.03` / `−0.41` at the column's precision; the sign is the raw difference. */
export function formatDeltaInColumn(value: number, decimals: number): string {
  if (!Number.isFinite(value)) {
    return '—'
  }
  const rounded = Number(value.toFixed(decimals))
  if (rounded === 0) {
    return '±0'
  }
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(decimals)}`
}

/** `±0.29`: a spread one decimal finer than the values it qualifies, capped like them. */
export function formatSpreadInColumn(value: number, decimals: number): string {
  return Number.isFinite(value) ? `±${value.toFixed(Math.min(MAX_DECIMALS, decimals + 1))}` : ''
}
