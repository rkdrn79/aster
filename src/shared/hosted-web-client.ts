/** EXPERIMENT(relay): where a phone loads the browser client when its host is reached through a relay. */
export const HOSTED_WEB_CLIENT_URL = 'https://rkdrn79.github.io/aster-site/app/web-index.html'

/** The URL normalized, or null unless it is http(s) without credentials or a fragment. */
export function parseWebClientUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

// Why the fragment: pairing URLs carry full credentials, and a fragment never reaches a server or Referer.
export function withPairingFragment(webClientUrl: string, pairingUrl: string): string {
  const url = new URL(webClientUrl)
  url.hash = `pairing=${encodeURIComponent(pairingUrl)}`
  return url.toString()
}
