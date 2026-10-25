import { describe, expect, it } from 'vitest'
import {
  allowsArtifactCloudAuthOverride,
  ARTIFACT_CLOUD_UNAVAILABLE_ERROR,
  resolveArtifactCloudApiUrl
} from './artifact-cloud-config'

const PRODUCT_API = 'https://share.example.test'

describe('resolveArtifactCloudApiUrl', () => {
  it('uses the product artifact origin by default', () => {
    expect(resolveArtifactCloudApiUrl(undefined, {}, true, PRODUCT_API)).toBe(PRODUCT_API)
  })

  it('refuses to fall back to any host when the build has no artifact service', () => {
    expect(() => resolveArtifactCloudApiUrl(undefined, {}, true, null)).toThrow(
      ARTIFACT_CLOUD_UNAVAILABLE_ERROR
    )
    expect(() => resolveArtifactCloudApiUrl('https://share.onorca.dev', {}, true, null)).toThrow(
      /artifact host/
    )
  })

  it('allows loopback HTTP only in development', () => {
    expect(
      resolveArtifactCloudApiUrl(
        undefined,
        { ORCA_ARTIFACTS_API_URL: 'http://127.0.0.1:45961' },
        false,
        PRODUCT_API
      )
    ).toBe('http://127.0.0.1:45961')
    expect(() =>
      resolveArtifactCloudApiUrl('http://127.0.0.1:45961', {}, true, PRODUCT_API)
    ).toThrow(/HTTPS/)
  })

  it('rejects origins that could receive the product access token', () => {
    expect(() => resolveArtifactCloudApiUrl('https://example.com', {}, false, PRODUCT_API)).toThrow(
      /artifact host/
    )
    expect(() => resolveArtifactCloudApiUrl(`${PRODUCT_API}/path`, {}, false, PRODUCT_API)).toThrow(
      /origin/
    )
  })

  it('allows auth token overrides only in non-production development builds', () => {
    expect(allowsArtifactCloudAuthOverride({}, false)).toBe(true)
    expect(allowsArtifactCloudAuthOverride({ NODE_ENV: 'production' }, false)).toBe(false)
    expect(allowsArtifactCloudAuthOverride({}, true)).toBe(false)
  })
})
