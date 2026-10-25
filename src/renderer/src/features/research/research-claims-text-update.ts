import type { ResearchClaimAudit } from '../../../../shared/research/research-harness-results'

// The harness's manuscript-number rule: a number not glued to a word, macro, or other digits.
const NUMBER = /(?<![\p{L}\p{N}_.\\])(\d+(?:\.\d+)?|\.\d+)(?![\p{L}\p{N}_]|\.\d)(\s*\\%)?/gu
const FORMAT = /^(fixed|percent):(\d{1,2})$/u

export type ClaimTextUpdate = {
  file: string
  line: number
  recorded: number
  current: number
  format: string | null
  /** The new number as the paper will print it, e.g. `84.1%`. */
  label: string
}

/**
 * A mismatch the paper can fix by stating its Run's current value: the Run moved since the claim
 * was recorded, or the paper's number was edited away from it.
 */
export function claimTextUpdate(claim: ResearchClaimAudit): ClaimTextUpdate | null {
  if (claim.status !== 'mismatch' || !claim.location?.line) {
    return null
  }
  const stated = claim.evidence.filter(
    (item) => item.role === 'stated' && item.currentValue !== null && item.recordedValue !== null
  )
  const changed = stated.find((item) => item.status === 'mismatch') ?? stated[0]
  if (!changed || changed.currentValue === null || changed.recordedValue === null) {
    return null
  }
  const runMoved = changed.currentValue !== changed.recordedValue
  const paperMoved = claim.manuscript?.values?.some((value) => !value.found) ?? false
  if (!runMoved && !paperMoved) {
    return null
  }
  const format = changed.format ?? null
  const match = format ? FORMAT.exec(format) : null
  const scaled = match?.[1] === 'percent' ? changed.currentValue * 100 : changed.currentValue
  return {
    file: claim.location.file,
    line: claim.location.line,
    recorded: changed.recordedValue,
    current: changed.currentValue,
    format,
    label: match
      ? `${scaled.toFixed(Number(match[2]))}${match[1] === 'percent' ? '%' : ''}`
      : String(changed.currentValue)
  }
}

type NumberToken = { start: number; digits: string; decimals: number; percent: boolean }

function numberTokens(lineText: string): NumberToken[] {
  const comment = lineText.search(/(?<!\\)%/u)
  const searchable = comment === -1 ? lineText : lineText.slice(0, comment)
  return [...searchable.matchAll(NUMBER)].map((match) => {
    const digits = match[1]
    return {
      start: match.index,
      digits,
      decimals: digits.includes('.') ? digits.length - digits.indexOf('.') - 1 : 0,
      percent: Boolean(match[2])
    }
  })
}

/**
 * `lineText` with the claim's number rewritten to `current`, keeping its decimals and scale
 * (`82.9\%` for 0.829 becomes `84.1\%` for 0.841). The number is the one stating `recorded`, else
 * the line's only number shaped like the claim (an edited paper). Null when that is not exactly
 * one number, so an ambiguous line is never guessed at.
 */
export function replaceClaimNumber(
  lineText: string,
  recorded: number,
  current: number,
  format: string | null
): string | null {
  const formatMatch = format ? FORMAT.exec(format) : null
  const formatScale = formatMatch ? (formatMatch[1] === 'percent' ? 100 : 1) : null
  const tokens = numberTokens(lineText).filter(
    (token) => !formatMatch || token.decimals === Number(formatMatch[2])
  )
  const stating = tokens.flatMap((token) => {
    const scale = (formatScale ? [formatScale] : [1, 100]).find((candidate) => {
      const value = recorded * candidate
      if (token.decimals === 0 && !token.percent && !Number.isInteger(value)) {
        return false
      }
      return Math.abs(Number(token.digits) - Math.abs(value)) <= 0.5 * 10 ** -token.decimals + 1e-9
    })
    return scale === undefined ? [] : [{ token, scale }]
  })
  // Why decimals only: integers on a claim line are ranks, steps, or section numbers.
  const shaped = tokens.filter((token) => formatMatch || token.decimals > 0)
  const hit =
    stating.length > 0
      ? stating.length === 1
        ? stating[0]
        : null
      : shaped.length === 1
        ? { token: shaped[0], scale: formatScale ?? (shaped[0].percent ? 100 : 1) }
        : null
  if (!hit) {
    return null
  }
  const next = Math.abs(current * hit.scale).toFixed(hit.token.decimals)
  return `${lineText.slice(0, hit.token.start)}${next}${lineText.slice(hit.token.start + hit.token.digits.length)}`
}

/** The whole file with the claim's line updated; null when that line no longer states the number. */
export function applyClaimTextUpdate(content: string, update: ClaimTextUpdate): string | null {
  const lines = content.split('\n')
  const index = update.line - 1
  if (index < 0 || index >= lines.length) {
    return null
  }
  const next = replaceClaimNumber(lines[index], update.recorded, update.current, update.format)
  if (next === null) {
    return null
  }
  lines[index] = next
  return lines.join('\n')
}
