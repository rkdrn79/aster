export type ResearchWatchComparison = '<' | '<=' | '>' | '>='

export type ResearchWatchCondition =
  | { kind: 'exit' }
  | { kind: 'failed' }
  | { kind: 'succeeded' }
  | { kind: 'metric'; metric: string; op: ResearchWatchComparison; value: number }
  | { kind: 'nan' }
  | { kind: 'stall'; minutes: number }
  | { kind: 'log'; source: string; flags: string }

export const MAX_RESEARCH_WATCH_CONDITIONS = 12
const MAX_LOG_PATTERN = 200
const METRIC_CONDITION =
  /^metric:([A-Za-z0-9_.\-/]{1,128})(<=|>=|<|>)(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)$/i

function parseLogCondition(body: string): ResearchWatchCondition {
  const literal = /^\/(.+)\/([imsu]*)$/.exec(body)
  const source = literal ? literal[1] : body
  const flags = literal ? literal[2] : ''
  if (!source || source.length > MAX_LOG_PATTERN) {
    throw new Error(`log: needs a pattern of 1-${MAX_LOG_PATTERN} characters.`)
  }
  try {
    new RegExp(source, flags)
  } catch (error) {
    throw new Error(`log:${body} is not a valid regular expression: ${String(error)}`)
  }
  return { kind: 'log', source, flags }
}

function parseOne(text: string): ResearchWatchCondition {
  const condition = text.trim()
  const lower = condition.toLowerCase()
  if (lower === 'exit' || lower === 'failed' || lower === 'succeeded' || lower === 'nan') {
    return { kind: lower }
  }
  if (lower.startsWith('stall:')) {
    const minutes = Number(condition.slice('stall:'.length))
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 7 * 24 * 60) {
      throw new Error('stall:<minutes> needs whole minutes between 1 and 10080.')
    }
    return { kind: 'stall', minutes }
  }
  if (lower.startsWith('log:')) {
    return parseLogCondition(condition.slice('log:'.length))
  }
  const metric = METRIC_CONDITION.exec(condition)
  if (metric) {
    const [, name, op, value] = metric
    if (op !== '<' && op !== '<=' && op !== '>' && op !== '>=') {
      throw new Error(`Unknown comparison in ${condition}.`)
    }
    return { kind: 'metric', metric: name, op, value: Number(value) }
  }
  throw new Error(
    `Unknown watch condition "${condition}". Use exit, failed, succeeded, nan, stall:<minutes>, metric:<name><op><value> or log:<regex>.`
  )
}

/**
 * `--on` values: comma-separated, repeatable. `log:` takes the rest of its value, commas included,
 * so put it last or in its own `--on`.
 */
export function parseResearchWatchConditions(values: readonly string[]): ResearchWatchCondition[] {
  const conditions: ResearchWatchCondition[] = []
  for (const value of values) {
    let rest = value.trim()
    while (rest) {
      if (rest.toLowerCase().startsWith('log:')) {
        conditions.push(parseOne(rest))
        break
      }
      const comma = rest.indexOf(',')
      const head = comma === -1 ? rest : rest.slice(0, comma)
      rest = comma === -1 ? '' : rest.slice(comma + 1).trim()
      if (head.trim()) {
        conditions.push(parseOne(head))
      }
    }
  }
  const unique = new Map(conditions.map((entry) => [formatResearchWatchCondition(entry), entry]))
  if (!unique.size) {
    throw new Error('Pass at least one --on condition, e.g. --on failed,stall:30.')
  }
  if (unique.size > MAX_RESEARCH_WATCH_CONDITIONS) {
    throw new Error(`A watch takes at most ${MAX_RESEARCH_WATCH_CONDITIONS} conditions.`)
  }
  return [...unique.values()]
}

export function formatResearchWatchCondition(condition: ResearchWatchCondition): string {
  switch (condition.kind) {
    case 'metric':
      return `metric:${condition.metric}${condition.op}${condition.value}`
    case 'stall':
      return `stall:${condition.minutes}`
    case 'log':
      return condition.flags
        ? `log:/${condition.source}/${condition.flags}`
        : `log:${condition.source}`
    default:
      return condition.kind
  }
}
