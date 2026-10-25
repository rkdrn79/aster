import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import type { ResearchProposal } from '../../../../shared/research/research-proposals'
import type { ResearchRunRecord } from '../../../../shared/research/research-records'
import type { ResearchRunStatusFacts } from './research-run-status-label'
import { catalogRunReference } from './use-research-harness-experiment'

/** One decision the notebook asks of the user. */
export type NeedsYouItem =
  | {
      kind: 'failed-run'
      key: string
      at: string
      run: ResearchRunRecord
      status: ResearchRunStatusFacts
      /** The open `run.failed` rule finding for this Run, shown as one item with it. */
      finding: ResearchFinding | null
    }
  | { kind: 'finding'; key: string; at: string; finding: ResearchFinding }
  /** A pending proposal: approve or reject. */
  | { kind: 'proposal'; key: string; at: string; proposal: ResearchProposal }
  /** An approved proposal that needs code and has not gone to a Workbench chat yet. */
  | { kind: 'handoff'; key: string; at: string; proposal: ResearchProposal }

/** How many items the notebook shows before "N more". */
export const NEEDS_YOU_SHOWN = 3

/** Failures first, then decisions agents wait on, code to hand off, and warnings. */
function rank(item: NeedsYouItem): number {
  switch (item.kind) {
    case 'failed-run':
      return 0
    case 'finding':
      return item.finding.severity === 'fail' ? 0 : 3
    case 'proposal':
      return 1
    case 'handoff':
      return 2
  }
}

/**
 * Failed Runs, pending proposals, approved `needsCode` proposals not yet handed off, and open warn
 * and fail findings, in one ordered list. Info findings never appear. A failed Run and its
 * `run.failed` finding are one item; it leaves once that finding is closed, or, without a finding,
 * once the user dismisses it (`dismissedRuns` holds `run:<id>` keys).
 */
export function experimentNeedsYou(input: {
  runs: readonly ResearchRunRecord[]
  statusOf: (run: ResearchRunRecord) => ResearchRunStatusFacts
  findings: readonly ResearchFinding[]
  proposals: readonly ResearchProposal[]
  dismissedRuns: ReadonlySet<string>
}): NeedsYouItem[] {
  const failedFindings = new Map<string, ResearchFinding>()
  for (const finding of input.findings) {
    if (finding.check === 'run.failed') {
      for (const reference of finding.runs) {
        failedFindings.set(reference, finding)
      }
    }
  }
  const items: NeedsYouItem[] = []
  const merged = new Set<string>()
  for (const run of input.runs) {
    const status = input.statusOf(run)
    if (status.state !== 'failed') {
      continue
    }
    const reference = catalogRunReference(run)
    const finding = reference ? (failedFindings.get(reference) ?? null) : null
    if (finding) {
      merged.add(finding.id)
    }
    const key = `run:${run.id}`
    if (finding ? finding.status === 'open' : !input.dismissedRuns.has(key)) {
      const at = finding?.createdAt ?? run.observedAt ?? run.createdAt
      items.push({ kind: 'failed-run', key, at, run, status, finding })
    }
  }
  for (const finding of input.findings) {
    if (finding.status === 'open' && finding.severity !== 'info' && !merged.has(finding.id)) {
      items.push({ kind: 'finding', key: `finding:${finding.id}`, at: finding.createdAt, finding })
    }
  }
  for (const proposal of input.proposals) {
    if (proposal.state === 'pending') {
      items.push({ kind: 'proposal', key: `proposal:${proposal.id}`, at: proposal.at, proposal })
    } else if (proposal.state === 'approved' && proposal.needsCode && !proposal.handoff) {
      const at = proposal.decision?.at ?? proposal.at
      items.push({ kind: 'handoff', key: `handoff:${proposal.id}`, at, proposal })
    }
  }
  return items.toSorted(
    (left, right) => rank(left) - rank(right) || right.at.localeCompare(left.at)
  )
}
