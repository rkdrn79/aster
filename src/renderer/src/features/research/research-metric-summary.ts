import type { MetricEvent } from './research-source-reader'

export function observedMetricValue(
  events: MetricEvent[],
  mode: 'last' | 'best',
  direction: 'minimize' | 'maximize' | null | undefined
): number | null {
  if (!events.length || (mode === 'best' && !direction)) {
    return null
  }
  if (mode === 'last') {
    return events.at(-1)?.value ?? null
  }
  return events.reduce(
    (best, event) =>
      direction === 'minimize' ? Math.min(best, event.value) : Math.max(best, event.value),
    events[0].value
  )
}
