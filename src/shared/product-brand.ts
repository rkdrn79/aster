import { CLI_COMMAND_NAMES } from './cli-command-names'
import brandData from './product-brand.json'

// Every upstream service URL. null hides the feature and keeps the build off services it does not own.
export type ProductBrandLinks = {
  homepage: string | null
  docs: string | null
  changelog: string | null
  /** Base URL of the what's-new feed serving `nudge.json` and `changelog.json`. */
  whatsNewFeed: string | null
  github: string | null
  issues: string | null
  discord: string | null
  x: string | null
  privacy: string | null
  skillShareBase: string | null
  skillRepository: string | null
  feedbackEndpoint: string | null
  pluginMarketplace: string | null
  pluginKillList: string | null
  updateFeed: string | null
  cloudApi: string | null
  cloudClientId: string | null
  relayDirector: string | null
  pushGateway: string | null
  artifactsApi: string | null
  telemetry: string | null
}

export type ProductBrand = {
  name: string
  id: string
  appId: string
  urlScheme: string
  cliName: string
  description: string
  copyrightHolder: string
  copyrightYear: number
  licenseNoticeFile: string
  links: ProductBrandLinks
}

// Release builds embed the feed in both main and renderer; local builds stay disconnected.
const buildUpdateFeed = typeof ASTER_UPDATE_FEED_URL === 'undefined' ? null : ASTER_UPDATE_FEED_URL
export const PRODUCT_BRAND: ProductBrand = {
  ...brandData,
  links: { ...brandData.links, updateFeed: buildUpdateFeed ?? brandData.links.updateFeed }
}

export const PRODUCT_NAME = PRODUCT_BRAND.name

export const PRODUCT_COPYRIGHT = `Copyright © ${PRODUCT_BRAND.copyrightYear} ${PRODUCT_BRAND.copyrightHolder}`

const UPSTREAM_CLI_NAME = 'orca'

/** The shell command this build installs and names in help, prompts and copyable commands. */
export const CLI_NAME = PRODUCT_BRAND.cliName

/** Dev builds run as their own command so they never claim the production one. */
export const DEV_CLI_NAME = `${CLI_NAME}-dev`

// Why: GNOME's screen reader owns /usr/bin/orca, so only that name needs a Linux-only variant.
export const LINUX_CLI_NAME = CLI_NAME === UPSTREAM_CLI_NAME ? `${UPSTREAM_CLI_NAME}-ide` : CLI_NAME

const UPSTREAM_CLI_NAMES = [
  UPSTREAM_CLI_NAME,
  `${UPSTREAM_CLI_NAME}-ide`,
  `${UPSTREAM_CLI_NAME}-dev`
]

/** Commands upstream and pre-rename builds installed: recognized for cleanup only, never installed. */
export const LEGACY_CLI_NAMES: readonly string[] = UPSTREAM_CLI_NAMES.filter(
  (name) => ![CLI_NAME, LINUX_CLI_NAME, DEV_CLI_NAME].includes(name)
)

/** Command names an older peer may still send; accepted on the wire, never produced. */
export const ACCEPTED_CLI_NAMES: readonly [string, ...string[]] = [
  CLI_NAME,
  ...[LINUX_CLI_NAME, DEV_CLI_NAME, ...UPSTREAM_CLI_NAMES].filter(
    (name, index, all) => name !== CLI_NAME && all.indexOf(name) === index
  )
]

const UPSTREAM_PRODUCT_ID = 'orca'

/** Fork-only product decisions branch on this, never on app.getName() or launcher env vars. */
export function isUpstreamProduct(): boolean {
  return PRODUCT_BRAND.id === UPSTREAM_PRODUCT_ID
}

/** A page of the product's docs site, or null when the build ships without one. */
export function productDocsUrl(path: string): string | null {
  const docs = PRODUCT_BRAND.links.docs
  return docs === null ? null : `${docs.replace(/\/+$/, '')}/${path}`
}

// Why: Electron names userData after the packaged productName; upstream ships none, so it gets package.json's `orca`.
export const USER_DATA_DIR_NAME = isUpstreamProduct() ? UPSTREAM_PRODUCT_ID : PRODUCT_BRAND.name

/** Dev builds keep their own profile so `pnpm dev` never overwrites the packaged app's runtime pointer. */
export const DEV_USER_DATA_DIR_NAME = `${PRODUCT_BRAND.id}-dev`

// Older peers and links created before the rebrand only know the upstream scheme.
export const LEGACY_URL_SCHEME = 'orca'

export const ACCEPTED_URL_SCHEMES: readonly string[] = [
  ...new Set([PRODUCT_BRAND.urlScheme, LEGACY_URL_SCHEME])
]

export function isAcceptedUrlProtocol(protocol: string): boolean {
  return ACCEPTED_URL_SCHEMES.some((scheme) => protocol.toLowerCase() === `${scheme}:`)
}

export function startsWithAcceptedUrlScheme(text: string): boolean {
  const lower = text.toLowerCase()
  return ACCEPTED_URL_SCHEMES.some((scheme) => lower.startsWith(`${scheme}://`))
}

/** The product name as either side of the rebrand wrote it, current name first, for an older peer's text. */
export const PEER_PRODUCT_NAMES: readonly string[] = [...new Set([PRODUCT_BRAND.name, 'Orca'])]

/** Regex source matching any of PEER_PRODUCT_NAMES. */
export const PEER_PRODUCT_NAME_PATTERN = `(?:${PEER_PRODUCT_NAMES.join('|')})`

// Upstream product names that must not reach users (the fork keeps them in code identifiers only).
export const UPSTREAM_PRODUCT_NAMES = ['Orca'] as const

// Prose names only: ORCA_* env vars, OrcaFoo identifiers, `~/.orca` style paths and
// `Orca.yaml`-style filenames stay intact. `.app` bundles are renamed because the packaged bundle is.
const UPSTREAM_PROSE_NAME_RE = /(?<![\w$./\\~])(?:Orca|ORCA)(?!\w|\.(?!app\b)[A-Za-z])|오르카/g
const UPSTREAM_DEEP_LINK_RE = /(?<![\w.-])orca:\/\//g
// Only invocations (`orca <subcommand>`, `orca --help`, `orca CLI`, a backticked `orca`), so orca.yaml and
// mock data such as a repo named "orca" keep their text.
const UPSTREAM_CLI_INVOCATION_RE = new RegExp(
  `(?<![\\w$./\\\\~-])${UPSTREAM_CLI_NAME}(-ide|-dev)?(?=\\s+(?:${[...CLI_COMMAND_NAMES]
    .sort((left, right) => right.length - left.length)
    .join('|')}|--help|CLI|commands?)(?![\\w-])|\`)`,
  'g'
)

function brandCliName(_match: string, suffix: string | undefined): string {
  return suffix === '-ide' ? LINUX_CLI_NAME : suffix === '-dev' ? DEV_CLI_NAME : CLI_NAME
}

// Why: bundled skills ship under the product's own prefix so they never share an agent skill dir
// with upstream's; generic upstream names are rewritten only as `/name` or `$name` invocations.
const UPSTREAM_PREFIXED_SKILL_RE =
  /(?<![\w.-])(?<![\w./]\/)orca-(cli|emulator-android|emulator|gpu|jira|linear|per-workspace-env)(?![\w-])/g
const UPSTREAM_GENERIC_SKILL_RE =
  /(?<![\w/.:-])([/$])(orchestration|computer-use|jira-tickets|linear-tickets)(?![\w/-])/g

function brandSkillNames(text: string): string {
  if (isUpstreamProduct()) {
    return text
  }
  return text
    .replace(UPSTREAM_PREFIXED_SKILL_RE, `${PRODUCT_BRAND.id}-$1`)
    .replace(UPSTREAM_GENERIC_SKILL_RE, `$1${PRODUCT_BRAND.id}-$2`)
}

/**
 * Rewrites upstream branding in product copy (catalog values and inline English defaults).
 * Apply it to templates before interpolation, never to rendered text, so user data such as a
 * repo named "Orca-tools" is shown verbatim.
 */
export function withProductName(text: string): string {
  return brandSkillNames(
    text
      .replace(UPSTREAM_PROSE_NAME_RE, PRODUCT_BRAND.name)
      .replace(UPSTREAM_DEEP_LINK_RE, `${PRODUCT_BRAND.urlScheme}://`)
      .replace(UPSTREAM_CLI_INVOCATION_RE, brandCliName)
  )
}

/** Brands every string leaf of a translation catalog; keys are left alone. */
export function withProductNameInCatalog(
  catalog: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(catalog).map(([key, child]) => [key, mapCatalogValue(child)])
  )
}

function mapCatalogValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return withProductName(value)
  }
  if (Array.isArray(value)) {
    return value.map(mapCatalogValue)
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, mapCatalogValue(child)])
    )
  }
  return value
}
