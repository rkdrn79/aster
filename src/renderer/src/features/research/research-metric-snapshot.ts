import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { RunObservation } from './research-source-reader'

export function metricSnapshotFromObservation(
  observation: RunObservation
): NonNullable<ResearchRunRecord['metricSnapshot']> {
  const latest = new Map<string, { name: string; split: string; value: number }>()
  for (const event of observation.events) {
    latest.set(`${event.metric}\u0000${event.split}`, {
      name: event.metric,
      split: event.split,
      value: event.value
    })
  }
  return {
    capturedAt: observation.observedAt,
    partial: observation.errorRows > 0 || observation.incompleteLastLine || latest.size > 24,
    metrics: [...latest.values()].slice(0, 24)
  }
}
