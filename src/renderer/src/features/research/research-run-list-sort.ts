import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { ResearchRunSummary } from '../../../../shared/research/research-run-summary'
import type { ResearchRunStatusFacts } from './research-run-status-label'

export type ResearchRunSort = 'newest' | 'name' | 'status' | 'metric'

// Why this order: what needs attention (running, failed) before what is settled.
const STATUS_ORDER: Record<ResearchRunStatusFacts['state'], number> = {
  running: 0,
  failed: 1,
  succeeded: 2,
  cancelled: 3,
  unknown: 4
}

function startedAt(run: ResearchRunRecord, status: ResearchRunStatusFacts): string {
  return status.startedAt ?? run.createdAt
}

/** Runs in the list's order; Runs without a primary metric sort after those with one. */
export function sortResearchRuns(
  runs: ResearchRunRecord[],
  sort: ResearchRunSort,
  {
    statusOf,
    primaryOf
  }: {
    statusOf: (run: ResearchRunRecord) => ResearchRunStatusFacts
    primaryOf: (run: ResearchRunRecord) => ResearchRunSummary['primary']
  }
): ResearchRunRecord[] {
  const newest = (a: ResearchRunRecord, b: ResearchRunRecord): number =>
    startedAt(b, statusOf(b)).localeCompare(startedAt(a, statusOf(a)))
  const score = (run: ResearchRunRecord): number | null => {
    const primary = primaryOf(run)
    const value = primary?.last?.value
    if (value === undefined || !Number.isFinite(value)) {
      return null
    }
    return primary?.direction === 'maximize' ? -value : value
  }
  const byName = new Intl.Collator(undefined, { numeric: true })
  return runs.toSorted((a, b) => {
    if (sort === 'name') {
      return byName.compare(a.name, b.name) || newest(a, b)
    }
    if (sort === 'status') {
      return STATUS_ORDER[statusOf(a).state] - STATUS_ORDER[statusOf(b).state] || newest(a, b)
    }
    if (sort === 'metric') {
      const left = score(a)
      const right = score(b)
      if (left !== null && right !== null && left !== right) {
        return left - right
      }
      if ((left === null) !== (right === null)) {
        return left === null ? 1 : -1
      }
    }
    return newest(a, b)
  })
}
