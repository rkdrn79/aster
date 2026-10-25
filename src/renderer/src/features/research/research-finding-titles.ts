import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'

/** What a finding says in plain language: a title and an optional one-line summary. */
export type FindingPresentation = { title: string; summary: string | null }

/** The one action that resolves a finding, beside Ask agent and Dismiss. */
export type FindingFix = 'mark-failed' | 'choose-baseline' | 'open-writing'

const CLAIM_TEXT = /^Claim (\S+) "([\s\S]*)": ([\s\S]*)$/u
const TOO_FEW_SEEDS = /^(\d+) Runs? with this config apart from the seed; the brief asks for (\d+)/u
const STALE_FOR = /has not been updated for (.+)$/u

const OPENS_WITH_PATH = /^\S*[./]/u

/** Upper-cases the first letter, unless the text opens with a Run's name or a file name. */
function sentence(text: string, names: readonly string[]): string {
  const trimmed = text.trim()
  return !trimmed || OPENS_WITH_PATH.test(trimmed) || names.some((name) => trimmed.startsWith(name))
    ? trimmed
    : `${trimmed[0]?.toUpperCase() ?? ''}${trimmed.slice(1)}`
}

function claimParts(
  finding: ResearchFinding,
  names: readonly string[]
): { id: string; reasons: string | null } {
  const match = CLAIM_TEXT.exec(finding.text)
  const fromEvidence = finding.evidence.find((item) => item?.kind === 'claim')
  const id =
    match?.[1] ?? (fromEvidence?.kind === 'claim' ? fromEvidence.claim : null) ?? 'without an ID'
  return { id, reasons: match?.[3] ? sentence(match[3], names) : null }
}

/** `finding.text` here already names Runs instead of `<experiment>/<run>`. */
function ruleTitle(
  finding: ResearchFinding,
  run: string,
  names: readonly string[]
): FindingPresentation | null {
  const text = sentence(finding.text, names)
  switch (finding.check) {
    case 'run.failed':
      return text.startsWith('Cancelled')
        ? { title: `Run ${run} was cancelled`, summary: text }
        : { title: `Run ${run} failed`, summary: text }
    case 'run.harness-exited':
      return {
        title: `Run ${run} is marked running, but its launcher exited`,
        summary: 'It will never record its own end. Mark it failed if it did not finish.'
      }
    case 'run.stale': {
      const quiet = STALE_FOR.exec(finding.text)?.[1]
      return {
        title: `Run ${run} stopped reporting`,
        summary: quiet ? `Marked running, but nothing was recorded for ${quiet}` : text
      }
    }
    case 'run.no-metrics':
      return { title: `Run ${run} recorded no metrics`, summary: text }
    case 'run.primary-metric-missing':
      return { title: `Run ${run} has no values for the primary metric`, summary: text }
    case 'run.non-finite':
      return { title: `Run ${run} logged NaN or Infinity`, summary: text }
    case 'repro.commit-unknown':
      return { title: `No git commit is recorded for ${run}`, summary: null }
    case 'repro.patch-truncated':
      return { title: `The code patch of ${run} is incomplete`, summary: text }
    case 'repro.capture-not-at-launch':
      return { title: `The code of ${run} was captured after launch`, summary: text }
    case 'repro.config-missing':
      return { title: `No config is saved with ${run}`, summary: text }
    case 'repro.dirty-launch':
      return { title: `Run ${run} launched with uncommitted changes`, summary: text }
    case 'compare.baseline-missing':
      return finding.text.includes('names no baseline')
        ? {
            title: 'No baseline to compare against',
            summary: 'Rule checks and Run summaries compare every Run with the baseline you choose.'
          }
        : { title: 'The baseline Run cannot be found', summary: text }
    case 'compare.condition-mismatch':
      return { title: `Run ${run} is not comparable with the baseline`, summary: text }
    case 'compare.condition-unknown':
      return { title: `Unclear whether ${run} is comparable with the baseline`, summary: text }
    case 'compare.step-mismatch':
      return { title: `Run ${run} trained for a different number of steps`, summary: text }
    case 'output.sample-mismatch':
      return { title: `Run ${run} was evaluated on different samples`, summary: text }
    case 'stats.too-few-seeds': {
      const seeds = TOO_FEW_SEEDS.exec(finding.text)
      const count = Number(seeds?.[1])
      return {
        title: `Too few seeds for ${run}`,
        summary: seeds
          ? `Only ${count} ${count === 1 ? 'seed' : 'seeds'} of this config so far; the plan asks for ${seeds[2]}`
          : text
      }
    }
    case 'claims.mismatch': {
      const claim = claimParts(finding, names)
      return { title: `Claim ${claim.id} doesn't match its evidence`, summary: claim.reasons }
    }
    case 'claims.missing-evidence': {
      const claim = claimParts(finding, names)
      return { title: `Claim ${claim.id} has no usable evidence`, summary: claim.reasons }
    }
    case 'claims.stale':
      return {
        title: `Claim ${claimParts(finding, names).id} is stale`,
        summary: "The Run's metrics changed after the claim was recorded"
      }
    default:
      return null
  }
}

/**
 * A plain-language title and summary for a finding; rule IDs, PIDs and Run references stay out of
 * it (see `findingIdentifiers`). Agent and user findings are already prose and keep their text.
 */
export function findingPresentation(
  finding: ResearchFinding,
  runName: (reference: string) => string
): FindingPresentation {
  if (finding.source !== 'rule') {
    return { title: finding.text, summary: null }
  }
  const names = finding.runs.map(runName)
  const text = finding.runs.reduce(
    (current, reference) => current.replaceAll(reference, runName(reference)),
    finding.text
  )
  return (
    ruleTitle({ ...finding, text }, names[0] ?? 'a Run', names) ?? {
      title: finding.text,
      summary: null
    }
  )
}

/** The check and finding IDs, for a tooltip; never the visible text. */
export function findingIdentifiers(finding: ResearchFinding): string {
  return `Check ${finding.check} · ${finding.id}`
}

export function findingFix(finding: ResearchFinding): FindingFix | null {
  switch (finding.check) {
    case 'run.harness-exited':
      return 'mark-failed'
    case 'compare.baseline-missing':
      return 'choose-baseline'
    case 'claims.mismatch':
    case 'claims.missing-evidence':
    case 'claims.stale':
      return 'open-writing'
    default:
      return null
  }
}
