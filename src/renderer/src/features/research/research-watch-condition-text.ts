import { parseResearchWatchConditions } from '../../../../shared/research/research-run-watch-conditions'

/** A `research watch --on` condition in words, e.g. `if it fails` or `loss < 0.3`. */
export function researchWatchConditionText(condition: string): string {
  let parsed
  try {
    ;[parsed] = parseResearchWatchConditions([condition])
  } catch {
    return condition
  }
  switch (parsed?.kind) {
    case 'exit':
      return 'when it ends'
    case 'failed':
      return 'if it fails'
    case 'succeeded':
      return 'when it succeeds'
    case 'nan':
      return 'on NaN'
    case 'stall':
      return `if silent ${parsed.minutes} min`
    case 'metric':
      return `${parsed.metric} ${parsed.op} ${parsed.value}`
    case 'log':
      return 'on a log match'
    default:
      return condition
  }
}

/** `Watched: if it fails, loss < 0.3`. */
export function researchWatchText(conditions: readonly string[]): string {
  return `Watched: ${[...new Set(conditions.map(researchWatchConditionText))].join(', ')}`
}
