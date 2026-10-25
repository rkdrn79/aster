import type {
  ResearchFinding,
  ResearchFindingEvidence,
  ResearchFindingLayer,
  ResearchFindingSeverity,
  ResearchFindingSource,
  ResearchFindingStatus
} from '../../../../shared/research/research-quality-findings'

export const FINDING_SEVERITY_LABELS: Record<ResearchFindingSeverity, string> = {
  fail: 'Fail',
  warn: 'Warn',
  info: 'Info'
}

export const FINDING_SEVERITY_DOT: Record<ResearchFindingSeverity, string> = {
  fail: 'bg-destructive',
  warn: 'bg-status-warning',
  info: 'bg-muted-foreground/50'
}

export const FINDING_SOURCE_LABELS: Record<ResearchFindingSource, string> = {
  rule: 'Rule',
  agent: 'Agent',
  user: 'You'
}

export const FINDING_STATUS_LABELS: Record<ResearchFindingStatus, string> = {
  open: 'Open',
  accepted: 'Accepted',
  dismissed: 'Dismissed',
  resolved: 'Resolved'
}

export const FINDING_LAYER_LABELS: Record<ResearchFindingLayer, string> = {
  integrity: 'Experiment integrity',
  output: 'Output quality'
}

const SEVERITY_RANK: Record<ResearchFindingSeverity, number> = { fail: 0, warn: 1, info: 2 }

export function worstFindingSeverity(findings: ResearchFinding[]): ResearchFindingSeverity | null {
  let worst: ResearchFindingSeverity | null = null
  for (const finding of findings) {
    if (worst === null || SEVERITY_RANK[finding.severity] < SEVERITY_RANK[worst]) {
      worst = finding.severity
    }
  }
  return worst
}

export function findingSeverityCounts(
  findings: ResearchFinding[]
): Record<ResearchFindingSeverity, number> {
  const counts = { fail: 0, warn: 0, info: 0 }
  for (const finding of findings) {
    counts[finding.severity] += 1
  }
  return counts
}

/** Open first, then worst severity, then newest. */
export function sortFindings(findings: ResearchFinding[]): ResearchFinding[] {
  return findings.toSorted(
    (left, right) =>
      Number(left.status !== 'open') - Number(right.status !== 'open') ||
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
      right.createdAt.localeCompare(left.createdAt)
  )
}

/** Open findings by `<experiment>/<run>`, for Run list badges and the inspector. */
export function openFindingsByRun(
  findings: ResearchFinding[]
): ReadonlyMap<string, ResearchFinding[]> {
  const byRun = new Map<string, ResearchFinding[]>()
  for (const finding of sortFindings(findings)) {
    if (finding.status !== 'open') {
      continue
    }
    for (const run of finding.runs) {
      byRun.set(run, [...(byRun.get(run) ?? []), finding])
    }
  }
  return byRun
}

function valueText(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(Number(value.toPrecision(6)))
  }
  return JSON.stringify(value) ?? 'null'
}

/** One line per evidence item; log excerpts are shown separately. */
export function findingEvidenceText(
  evidence: ResearchFindingEvidence,
  runName: (reference: string) => string
): string {
  switch (evidence.kind) {
    case 'metric': {
      const label = evidence.split ? `${evidence.split} ${evidence.metric}` : evidence.metric
      const step = evidence.step === null ? '' : ` @ step ${evidence.step}`
      return `${runName(evidence.run)} · ${label} = ${valueText(evidence.value)}${step}`
    }
    case 'log':
      return `${runName(evidence.run)} · train.log lines ${evidence.fromLine}–${evidence.toLine}`
    case 'file':
      return evidence.line === null ? evidence.path : `${evidence.path}:${evidence.line}`
    case 'manifest':
      return `${runName(evidence.run)} · run.json ${evidence.field} = ${valueText(evidence.value)}`
    case 'sample':
      return `${runName(evidence.run)} · sample ${evidence.sampleId}`
    case 'claim':
      return `Claim ${evidence.claim}`
  }
}
