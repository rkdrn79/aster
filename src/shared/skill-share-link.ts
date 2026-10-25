import { isAcceptedUrlProtocol, PRODUCT_BRAND, startsWithAcceptedUrlScheme } from './product-brand'

const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
// Only the product's own share host may hand out ids; null keeps upstream share links out.
const PRODUCTION_HOSTS = new Set(
  PRODUCT_BRAND.links.skillShareBase ? [new URL(PRODUCT_BRAND.links.skillShareBase).hostname] : []
)

export function skillShareDeepLink(shareId: string): string {
  return `${PRODUCT_BRAND.urlScheme}://skills/share/${shareId}`
}

export function parseSkillShareId(value: string): string | null {
  const trimmed = value.trim()
  if (SHARE_ID_PATTERN.test(trimmed)) {
    return trimmed
  }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (isAcceptedUrlProtocol(url.protocol)) {
    const match = `${url.host}${url.pathname}`.match(/^skills\/share\/([A-Za-z0-9_-]{1,128})\/?$/)
    return match?.[1] ?? null
  }
  const developmentHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(developmentHost && url.protocol === 'http:')) {
    return null
  }
  if (!PRODUCTION_HOSTS.has(url.hostname) && !developmentHost) {
    return null
  }
  const match = url.pathname.match(/^\/skills\/share\/([A-Za-z0-9_-]{1,128})\/?$/)
  return match?.[1] ?? null
}

export function skillShareIdFromArguments(argv: readonly string[]): string | null {
  for (const value of argv) {
    const id = parseSkillShareId(value)
    if (id && (value.includes('/skills/share/') || startsWithAcceptedUrlScheme(value))) {
      return id
    }
  }
  return null
}
