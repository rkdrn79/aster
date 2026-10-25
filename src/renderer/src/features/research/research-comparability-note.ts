import type { ComparisonCondition } from '../../../../shared/research/research-run-manifest'

type ConditionResult = { condition: ComparisonCondition; reasons: string[] }

/**
 * A few words on whether runs compare fairly on one metric; null when nothing needs saying.
 * `quietIfUnrecorded` keeps per-row notes silent when no run recorded its conditions at all;
 * `omitUnrecorded` leaves unrecorded conditions to one table-level `unrecordedConditionsNote`.
 */
export function comparabilityNote(
  result: ConditionResult,
  missingInSomeRuns: boolean,
  {
    quietIfUnrecorded = false,
    omitUnrecorded = false
  }: { quietIfUnrecorded?: boolean; omitUnrecorded?: boolean } = {}
): string | null {
  if (result.condition === 'different') {
    return `Can't compare: different ${result.reasons.join(', ')}`
  }
  if (missingInSomeRuns) {
    return 'Missing in some runs'
  }
  if (result.condition !== 'unknown' || omitUnrecorded) {
    return null
  }
  if (result.reasons.length > 0 && result.reasons.length <= 2) {
    return `Not recorded: ${result.reasons.join(', ')}`
  }
  return quietIfUnrecorded ? null : 'Conditions not recorded'
}

/** What no run recorded across every compared metric, said once instead of under each row. */
export function unrecordedConditionsNote(results: ConditionResult[]): string | null {
  const reasons = [
    ...new Set(
      results.filter((result) => result.condition === 'unknown').flatMap((result) => result.reasons)
    )
  ]
  if (!reasons.length) {
    return null
  }
  const more = reasons.length > 3 ? ` and ${reasons.length - 3} more` : ''
  return `Not recorded: ${reasons.slice(0, 3).join(', ')}${more}`
}
