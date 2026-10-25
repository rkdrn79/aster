// Why: parsers file split-less metrics under this split; naming it on every chip is noise.
const NO_SPLIT = 'unspecified'

/** `loss` or `loss / val` for a `metric\u0000split` group key. */
export function metricGroupLabel(group: string): string {
  const [metric, split] = group.split('\u0000')
  return !split || split === NO_SPLIT ? (metric ?? group) : `${metric} / ${split}`
}

export function hasNamedSplit(groups: readonly string[]): boolean {
  return groups.some((group) => {
    const split = group.split('\u0000')[1]
    return Boolean(split) && split !== NO_SPLIT
  })
}
