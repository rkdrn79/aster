export function parseConfigSnapshot(content: string): Record<string, string> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const entries = Object.entries(parsed)
    .slice(0, 100)
    .map(([key, value]) => [key, JSON.stringify(value).slice(0, 200)] as const)
  return Object.fromEntries(entries)
}

export function changedConfigKeys(configs: (Record<string, string> | null)[]): string[] {
  const keys = [...new Set(configs.flatMap((config) => Object.keys(config ?? {})))]
  return keys.filter((key) => {
    const values = configs.map((config) => config?.[key] ?? null)
    return values.some((value) => value !== values[0])
  })
}
