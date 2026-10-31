import { levenshtein } from './edit-distance'
import { parseRelayUrl } from './relay-url'
import { parseWebClientUrl } from './hosted-web-client'

export type ServeOptionValidationInput = {
  noPairing: boolean
  mobilePairing: boolean
  grantDesktopControl?: boolean
  recipeJson: boolean
  projectRoot: string | null | undefined
  /** EXPERIMENT(relay): orcad only. */
  relay?: string | null
  /** EXPERIMENT(relay): orcad only. */
  webClientUrl?: string | null
  pairingAddress?: string | null
}

export function getServeOptionValidationError(options: ServeOptionValidationInput): string | null {
  if (options.relay != null && !parseRelayUrl(options.relay)) {
    // Why not echoed: the value carries the relay key, and this message reaches logs.
    return '--relay expects a ws:// or wss:// relay URL without credentials or a fragment.'
  }
  if (options.relay != null && options.pairingAddress) {
    return 'Use either --relay or --pairing-address: the relay URL is the advertised endpoint.'
  }
  if (options.webClientUrl != null && !parseWebClientUrl(options.webClientUrl)) {
    return `--web-client-url expects an http:// or https:// URL without a fragment, got ${options.webClientUrl || "''"}.`
  }
  if (options.webClientUrl != null && (options.noPairing || options.mobilePairing)) {
    return '--web-client-url applies only to the default runtime pairing offer.'
  }
  if (options.noPairing && options.mobilePairing) {
    return 'Use either --mobile-pairing or --no-pairing, not both.'
  }
  if (options.grantDesktopControl && (options.noPairing || options.mobilePairing)) {
    return '--grant-desktop-control applies only to the default runtime pairing offer.'
  }
  if (options.recipeJson && options.noPairing) {
    return 'Recipe JSON output requires runtime pairing; remove --no-pairing.'
  }
  if (options.recipeJson && options.mobilePairing) {
    return 'Recipe JSON output requires runtime pairing; remove --mobile-pairing.'
  }
  if (options.recipeJson && !options.projectRoot) {
    return 'Recipe JSON output requires --project-root.'
  }
  return null
}

const SERVE_SECURITY_FLAG_NAMES = [
  '--no-pairing',
  '--serve-no-pairing',
  '--mobile-pairing',
  '--serve-mobile-pairing',
  '--grant-desktop-control',
  '--serve-grant-desktop-control',
  '--recipe-json',
  '--serve-recipe-json',
  '--pairing-address',
  '--serve-pairing-address'
] as const

const SERVE_VALUE_FLAG_NAMES = new Set([
  '--port',
  '--serve-port',
  '--pairing-address',
  '--serve-pairing-address',
  '--project-root',
  '--serve-project-root',
  '--pairing-code',
  '--environment'
])

function flagName(token: string): string {
  const equalsIndex = token.indexOf('=')
  return equalsIndex === -1 ? token : token.slice(0, equalsIndex)
}

/** Reject only near-miss pairing flags; Electron/Chromium switches stay open-ended. */
export function getServeFlagTypoError(argv: readonly string[]): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!
    if (token === '--') {
      break
    }
    if (!token.startsWith('--')) {
      continue
    }
    const name = flagName(token)
    let suggestion: string | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const candidate of SERVE_SECURITY_FLAG_NAMES) {
      const distance = levenshtein(name, candidate)
      const maxDistance = candidate.startsWith(name) ? 3 : 2
      if (distance > 0 && distance <= maxDistance && distance < bestDistance) {
        suggestion = candidate
        bestDistance = distance
      }
    }
    if (suggestion) {
      return `Unknown flag ${name}. Did you mean ${suggestion}?`
    }

    // A value that is not flag-shaped belongs to the preceding known value flag.
    // A `--`-prefixed space token remains a flag, matching parseArgs; use `=` when
    // a value itself starts with `--`.
    if (!token.includes('=') && SERVE_VALUE_FLAG_NAMES.has(name)) {
      const value = argv[index + 1]
      if (value !== undefined && !value.startsWith('--')) {
        index += 1
      }
    }
  }
  return null
}
