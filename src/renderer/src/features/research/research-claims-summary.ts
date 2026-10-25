import type {
  ResearchClaimAudit,
  ResearchClaimStatus,
  ResearchClaimsAuditResult
} from '../../../../shared/research/research-harness-results'

export const CLAIM_STATUS_LABELS: Record<ResearchClaimStatus, string> = {
  verified: 'Verified',
  mismatch: 'Mismatch',
  'missing-evidence': 'No evidence',
  stale: 'Stale'
}

const SEVERITY: Record<ResearchClaimStatus, number> = {
  mismatch: 0,
  'missing-evidence': 1,
  stale: 2,
  verified: 3
}

export function claimNeedsAttention(status: ResearchClaimStatus): boolean {
  return status === 'mismatch' || status === 'missing-evidence'
}

/** `12 claims · 1 mismatch`, or null when the paper has no claims yet. */
export function researchClaimsChipText(
  summary: ResearchClaimsAuditResult['summary']
): string | null {
  if (summary.total === 0) {
    return null
  }
  return [
    `${summary.total} ${summary.total === 1 ? 'claim' : 'claims'}`,
    summary.mismatch
      ? `${summary.mismatch} ${summary.mismatch === 1 ? 'mismatch' : 'mismatches'}`
      : null,
    summary.missingEvidence ? `${summary.missingEvidence} without evidence` : null
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Problems first, then manuscript order, so a mismatch is never below the fold. */
export function claimsBySeverity(claims: readonly ResearchClaimAudit[]): ResearchClaimAudit[] {
  return claims
    .map((claim, index) => ({ claim, index }))
    .sort(
      (left, right) =>
        SEVERITY[left.claim.status] - SEVERITY[right.claim.status] ||
        (left.claim.location?.line ?? Number.MAX_SAFE_INTEGER) -
          (right.claim.location?.line ?? Number.MAX_SAFE_INTEGER) ||
        left.index - right.index
    )
    .map(({ claim }) => claim)
}

type ClaimEvidence = ResearchClaimAudit['evidence'][number]

/** The number as the paper prints it, e.g. `83.0%` for a `percent:1` claim. */
export function claimEvidenceValue(evidence: ClaimEvidence): string | null {
  if (evidence.formatted) {
    return evidence.format?.startsWith('percent') ? `${evidence.formatted}%` : evidence.formatted
  }
  const value = evidence.currentValue ?? evidence.recordedValue
  return value === null ? null : String(value)
}

/** `lora-r16/seed-42 · acc (val) · 83.0%` for one piece of evidence. */
export function claimEvidenceText(evidence: ClaimEvidence): string {
  const metric = evidence.split ? `${evidence.metric} (${evidence.split})` : evidence.metric
  return [evidence.run, metric, claimEvidenceValue(evidence)].filter(Boolean).join(' · ')
}

/** What is wrong with a claim, in one sentence; null when it is verified. */
export function claimProblemText(claim: ResearchClaimAudit): string | null {
  if (claim.status === 'verified') {
    return null
  }
  const changed = claim.evidence.find((item) => item.status === 'mismatch')
  if (changed && changed.currentValue !== null) {
    return `${changed.run} now gives ${changed.currentValue}, not ${changed.recordedValue}.`
  }
  const stated = claim.evidence.find((item) => item.role === 'stated')
  if (claim.status === 'mismatch' && claim.manuscript?.values?.some((item) => !item.found)) {
    const value = stated ? claimEvidenceValue(stated) : null
    return value
      ? `The paper no longer states ${value} here.`
      : 'The paper no longer states this number here.'
  }
  if (claim.status === 'stale') {
    return 'Its metrics changed since it was recorded; the number still matches.'
  }
  return claim.evidence.find((item) => item.reason)?.reason ?? claim.reasons[0] ?? null
}

/** TeX's `\%` as the reader sees it. */
export function texNumberText(text: string): string {
  return text.replaceAll('\\%', '%')
}
