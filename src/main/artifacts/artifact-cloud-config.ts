import { app } from 'electron'
import { PRODUCT_BRAND } from '../../shared/product-brand'

export const ARTIFACT_CLOUD_UNAVAILABLE_ERROR = 'Artifact sharing is not configured for this build.'

function isPackaged(): boolean {
  try {
    return app?.isPackaged === true
  } catch {
    return false
  }
}

export function resolveArtifactCloudApiUrl(
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
  packaged = isPackaged(),
  productApiUrl: string | null = PRODUCT_BRAND.links.artifactsApi
): string {
  const candidate = override?.trim() || env.ORCA_ARTIFACTS_API_URL?.trim() || productApiUrl
  if (!candidate) {
    throw new Error(ARTIFACT_CLOUD_UNAVAILABLE_ERROR)
  }
  const url = new URL(candidate)
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  // Why: requests carry the product account token, so only the product's own artifact host may receive it.
  const firstParty = productApiUrl !== null && url.hostname === new URL(productApiUrl).hostname
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && !packaged)) {
    throw new Error('Artifact API URLs must use HTTPS; local development may use loopback HTTP.')
  }
  if (!firstParty && !loopback) {
    throw new Error("Artifact API URLs must use this build's artifact host or a loopback host.")
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Artifact API URL must be an origin without credentials, paths, or parameters.')
  }
  return url.origin
}

export function allowsArtifactCloudAuthOverride(
  env: NodeJS.ProcessEnv = process.env,
  packaged = isPackaged()
): boolean {
  return env.NODE_ENV !== 'production' && !packaged
}
