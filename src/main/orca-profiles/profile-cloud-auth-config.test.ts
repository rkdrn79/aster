import { describe, expect, it, vi } from 'vitest'
import {
  allowsPlaintextOrcaCloudSession,
  getOrcaCloudAuthConfig,
  isOrcaCloudDevAuthEnabled
} from './profile-cloud-auth-config'
import { PRODUCT_NAME } from '../../shared/product-brand'

vi.mock('electron', () => ({
  app: {
    isPackaged: false
  }
}))

const RELAY = { ASTER_RELAY_URL: 'https://relay.example.test' }

describe('cloud auth config', () => {
  it('keeps a packaged build off hosted services it does not own', () => {
    const unconfigured = {
      configured: false,
      setupMessage: `${PRODUCT_NAME} hosted connection is not configured for this build.`
    }
    expect(getOrcaCloudAuthConfig({}, true)).toEqual(unconfigured)
    // Upstream variable names configure nothing in this product.
    expect(
      getOrcaCloudAuthConfig(
        { ORCA_CLOUD_API_URL: 'https://login.example.test', ORCA_CLOUD_CLIENT_ID: 'desktop' },
        true
      )
    ).toEqual(unconfigured)
    expect(
      getOrcaCloudAuthConfig(
        { ASTER_CLOUD_API_URL: 'https://login.example.test', ASTER_CLOUD_CLIENT_ID: 'aster' },
        true
      ).configured
    ).toBe(false)
    expect(
      getOrcaCloudAuthConfig(
        {
          ASTER_CLOUD_API_URL: 'https://login.example.test',
          ASTER_CLOUD_CLIENT_ID: 'aster',
          ...RELAY
        },
        true
      )
    ).toMatchObject({
      configured: true,
      config: { relayDirectorUrl: 'https://relay.example.test' }
    })
  })

  it('builds default desktop auth endpoints from the API URL', () => {
    const state = getOrcaCloudAuthConfig({
      ASTER_CLOUD_API_URL: 'https://cloud.example/',
      ASTER_CLOUD_CLIENT_ID: 'desktop-client',
      ...RELAY
    })

    expect(state).toEqual({
      configured: true,
      config: {
        apiBaseUrl: 'https://cloud.example',
        authorizeEndpoint: 'https://cloud.example/v1/desktop/auth/authorize',
        sessionEndpoint: 'https://cloud.example/v1/desktop/auth/session',
        refreshEndpoint: 'https://cloud.example/v1/desktop/auth/refresh',
        capabilitiesEndpoint: 'https://cloud.example/v1/desktop/auth/capabilities',
        profileEndpoint: 'https://cloud.example/v1/desktop/auth/profile',
        orgEndpoint: 'https://cloud.example/v1/desktop/auth/org',
        logoutEndpoint: 'https://cloud.example/v1/desktop/auth/logout',
        relayTokenEndpoint: 'https://cloud.example/v1/desktop/auth/relay-token',
        relayDirectorUrl: 'https://relay.example.test',
        clientId: 'desktop-client',
        scope: 'openid profile email offline_access'
      }
    })
  })

  it('allows loopback HTTP endpoints for local desktop auth development', () => {
    const state = getOrcaCloudAuthConfig({
      ASTER_CLOUD_API_URL: 'http://localhost:4100',
      ASTER_CLOUD_CLIENT_ID: 'desktop-client',
      ASTER_RELAY_URL: 'http://localhost:4200'
    })

    expect(state.configured).toBe(true)
  })

  it('rejects loopback HTTP endpoints in packaged builds', () => {
    expect(
      getOrcaCloudAuthConfig(
        {
          ASTER_CLOUD_API_URL: 'http://localhost:4100',
          ASTER_CLOUD_CLIENT_ID: 'desktop-client',
          ...RELAY
        },
        true
      )
    ).toMatchObject({ configured: false })

    const httpsState = getOrcaCloudAuthConfig(
      {
        ASTER_CLOUD_API_URL: 'https://cloud.example',
        ASTER_CLOUD_CLIENT_ID: 'desktop-client',
        ...RELAY
      },
      true
    )
    expect(httpsState.configured).toBe(true)
  })

  it('rejects non-HTTPS non-loopback API URLs', () => {
    expect(
      getOrcaCloudAuthConfig({
        ASTER_CLOUD_API_URL: 'http://cloud.example',
        ASTER_CLOUD_CLIENT_ID: 'desktop-client',
        ...RELAY
      })
    ).toMatchObject({ configured: false })
  })

  it('allows dev plaintext sessions only outside production', () => {
    expect(
      allowsPlaintextOrcaCloudSession({
        ORCA_CLOUD_ALLOW_PLAINTEXT_SESSION: '1',
        NODE_ENV: 'development'
      })
    ).toBe(true)
    expect(
      allowsPlaintextOrcaCloudSession({
        ORCA_CLOUD_ALLOW_PLAINTEXT_SESSION: '1',
        NODE_ENV: 'production'
      })
    ).toBe(false)
  })

  it('ignores dev flags in packaged builds even without NODE_ENV', () => {
    // Why: packaged main bundles never define NODE_ENV, so packaged-ness must
    // gate the escape hatches on its own.
    expect(allowsPlaintextOrcaCloudSession({ ORCA_CLOUD_ALLOW_PLAINTEXT_SESSION: '1' }, true)).toBe(
      false
    )
    expect(isOrcaCloudDevAuthEnabled({ ORCA_CLOUD_DEV_AUTH: '1' }, true)).toBe(false)
  })

  it('allows local dev auth only outside production', () => {
    expect(
      isOrcaCloudDevAuthEnabled({
        ORCA_CLOUD_DEV_AUTH: '1',
        NODE_ENV: 'development'
      })
    ).toBe(true)
    expect(
      isOrcaCloudDevAuthEnabled({
        ORCA_CLOUD_DEV_AUTH: '1',
        NODE_ENV: 'production'
      })
    ).toBe(false)
  })
})
