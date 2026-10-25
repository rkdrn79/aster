import type { ResearchSampleRatingSummary } from '../../../../shared/research/research-sample-ratings'

/** Below this many judgments the counts are labeled a small sample. */
export const SMALL_SAMPLE_N = 10

type PairwiseCounts = NonNullable<ResearchSampleRatingSummary['pairwise']>
type SingleCounts = NonNullable<ResearchSampleRatingSummary['single']>

function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

export function isSmallSample(counts: { n: number } | null): boolean {
  return Boolean(counts && counts.n > 0 && counts.n < SMALL_SAMPLE_N)
}

/** Counts only, from the first Run's side; never a verdict about which Run is better. */
export function pairwiseCountsText(counts: PairwiseCounts | null): string {
  if (!counts?.n) {
    return 'No ratings yet'
  }
  return [
    counted(counts.wins, 'win', 'wins'),
    counted(counts.ties, 'tie', 'ties'),
    counted(counts.losses, 'loss', 'losses'),
    `n = ${counts.n}`
  ].join(' · ')
}

export function singleCountsText(counts: SingleCounts | null): string {
  if (!counts?.n) {
    return 'No ratings yet'
  }
  return `${counts.good} good · ${counts.bad} bad · ${counts.unsure} unsure · n = ${counts.n}`
}

export function agreementText(agreement: ResearchSampleRatingSummary['agreement']): string {
  if (!agreement?.overlap || agreement.rate === null) {
    return 'No sample rated by both you and an agent yet'
  }
  return `${Math.round(agreement.rate * 100)}% agree on ${counted(agreement.overlap, 'shared sample', 'shared samples')}`
}

export function judgeMixedText(summary: ResearchSampleRatingSummary): string | null {
  if (!summary.judgeMixed) {
    return null
  }
  const setups = summary.judges
    .map((judge) => `${[judge.provider, judge.model].filter(Boolean).join(' ')} (n = ${judge.n})`)
    .join(', ')
  return `Judge mixed: agent ratings come from ${summary.judges.length} judge setups (${setups}); model, prompt or rubric differ.`
}

export function topTagsText(tags: Record<string, number>, limit = 5): string | null {
  const top = Object.entries(tags)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
  return top.length ? top.map(([tag, count]) => `${tag} ${count}`).join(' · ') : null
}
