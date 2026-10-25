import type {
  ResearchPairwiseVerdict,
  ResearchSampleRating,
  ResearchSingleVerdict
} from '../../../../shared/research/research-sample-ratings'

/** The current person and agent judgment of one sample in one scope. */
export type SampleJudgments = {
  user: ResearchSampleRating | null
  agent: ResearchSampleRating | null
}

/** Single rates each listed Run; pairwise compares `run` (A, the baseline) with `against` (B). */
export type SampleRatingScope =
  | { mode: 'single'; runs: readonly string[] }
  | { mode: 'pairwise'; run: string; against: string }

export const SAMPLE_RATING_FILTERS = ['all', 'unrated', 'disagreements', 'bad'] as const
export type SampleRatingFilter = (typeof SAMPLE_RATING_FILTERS)[number]

export type SampleRatingIndex = ReadonlyMap<string, SampleJudgments>

export const NO_JUDGMENTS: SampleJudgments = { user: null, agent: null }
const flipped: Record<ResearchPairwiseVerdict, ResearchPairwiseVerdict> = {
  a: 'b',
  b: 'a',
  tie: 'tie'
}

function judgmentKey(sampleId: string, run: string, against: string | null): string {
  return JSON.stringify([sampleId, run, against])
}

export function isPairwiseVerdict(verdict: string): verdict is ResearchPairwiseVerdict {
  return verdict === 'a' || verdict === 'b' || verdict === 'tie'
}

export function isSingleVerdict(verdict: string): verdict is ResearchSingleVerdict {
  return verdict === 'good' || verdict === 'bad' || verdict === 'unsure'
}

/**
 * Indexes the harness's latest judgments; each pairwise one is reachable from both Runs' sides,
 * with a and b swapped for the reversed side.
 */
export function indexSampleRatings(ratings: readonly ResearchSampleRating[]): SampleRatingIndex {
  const index = new Map<string, SampleJudgments>()
  const put = (key: string, rating: ResearchSampleRating): void => {
    const current = index.get(key) ?? NO_JUDGMENTS
    index.set(
      key,
      rating.by === 'user' ? { ...current, user: rating } : { ...current, agent: rating }
    )
  }
  for (const rating of ratings) {
    if (rating.mode === 'single') {
      put(judgmentKey(rating.sampleId, rating.run, null), rating)
    } else if (rating.against && isPairwiseVerdict(rating.verdict)) {
      put(judgmentKey(rating.sampleId, rating.run, rating.against), rating)
      put(judgmentKey(rating.sampleId, rating.against, rating.run), {
        ...rating,
        run: rating.against,
        against: rating.run,
        verdict: flipped[rating.verdict]
      })
    }
  }
  return index
}

export function sampleJudgments(
  index: SampleRatingIndex,
  sampleId: string,
  run: string,
  against: string | null
): SampleJudgments {
  return index.get(judgmentKey(sampleId, run, against)) ?? NO_JUDGMENTS
}

export function judgmentsDisagree(judgments: SampleJudgments): boolean {
  return Boolean(
    judgments.user && judgments.agent && judgments.user.verdict !== judgments.agent.verdict
  )
}

/** `hasSample` says whether a Run's outputs include the sample, so it could be rated at all. */
export function sampleMatchesFilter(
  filter: SampleRatingFilter,
  sampleId: string,
  scope: SampleRatingScope,
  index: SampleRatingIndex,
  hasSample: (run: string) => boolean
): boolean {
  if (filter === 'all') {
    return true
  }
  const runs = scope.mode === 'single' ? scope.runs : [scope.run, scope.against]
  if (filter === 'bad') {
    return runs.some((run) => {
      const single = sampleJudgments(index, sampleId, run, null)
      return single.user?.verdict === 'bad' || single.agent?.verdict === 'bad'
    })
  }
  const units =
    scope.mode === 'single'
      ? scope.runs.filter(hasSample).map((run) => sampleJudgments(index, sampleId, run, null))
      : [sampleJudgments(index, sampleId, scope.run, scope.against)]
  return filter === 'unrated'
    ? units.some((judgments) => !judgments.user)
    : units.some(judgmentsDisagree)
}

const RATING_TAG = /^[a-z0-9][a-z0-9-]{0,39}$/
const MAX_RATING_TAGS = 8

/** Comma- or space-separated tags, checked against the harness's slug rule before saving. */
export function parseRatingTags(text: string): { tags: string[] } | { error: string } {
  const tags = [
    ...new Set(
      text
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(Boolean)
    )
  ]
  const invalid = tags.find((tag) => !RATING_TAG.test(tag))
  if (invalid) {
    return { error: `Tags use 1–40 lowercase letters, digits or hyphens: ${invalid}` }
  }
  return tags.length > MAX_RATING_TAGS
    ? { error: `Use at most ${MAX_RATING_TAGS} tags.` }
    : { tags }
}
