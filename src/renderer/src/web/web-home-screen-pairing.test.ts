import { describe, expect, it } from 'vitest'
import { homeScreenPairingLink, homeScreenPairingOffer } from './web-home-screen-pairing'
import {
  parseWebPairingInput,
  readPairingInputFromLocation,
  type WebPairingOffer
} from './web-pairing'
import { MIGRATED_DEVICE_TOKEN_PREFIX } from './web-runtime-credential-source'

const PUBLIC_KEY = 'dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1lbmNvZGVkMDAwMA=='

function environment(deviceToken: string) {
  return {
    preferredEndpointId: 'ws-1',
    endpoints: [
      {
        id: 'ws-1',
        kind: 'websocket' as const,
        label: 'WebSocket',
        endpoint: 'wss://relay.example.workers.dev/ws?server=srv_abc',
        deviceToken,
        publicKeyB64: PUBLIC_KEY
      }
    ]
  }
}

const pairedOffer: WebPairingOffer = {
  v: 2,
  endpoint: 'wss://relay.example.workers.dev/ws?server=srv_abc',
  deviceToken: 'original-token',
  publicKeyB64: PUBLIC_KEY,
  pairedDeviceId: 'device-row-1',
  scope: 'runtime'
}

describe('home screen pairing link', () => {
  it('re-encodes a stored pairing into a web client link the web client pairs from', () => {
    const offer = homeScreenPairingOffer(environment('stored-token'), null)
    expect(offer).not.toBeNull()
    const link = homeScreenPairingLink('https://example.github.io/app/web-index.html', offer!)

    const url = new URL(link)
    expect(`${url.origin}${url.pathname}`).toBe('https://example.github.io/app/web-index.html')
    // Why the fragment: it never reaches a server or a Referer header.
    expect(url.search).toBe('')
    expect(parseWebPairingInput(readPairingInputFromLocation(url)!)).toEqual({
      v: 2,
      endpoint: 'wss://relay.example.workers.dev/ws?server=srv_abc',
      deviceToken: 'stored-token',
      publicKeyB64: PUBLIC_KEY,
      scope: 'runtime'
    })
    // Pasting the whole link into the Connect screen pairs the same way.
    expect(parseWebPairingInput(link)?.deviceToken).toBe('stored-token')
  })

  it('uses the code this page paired with once a device key replaced the stored one', () => {
    const migrated = environment(`${MIGRATED_DEVICE_TOKEN_PREFIX}device-key-1`)
    expect(homeScreenPairingOffer(migrated, null)).toBeNull()
    expect(homeScreenPairingOffer(migrated, pairedOffer)).toEqual(pairedOffer)
  })

  it('never hands out a remembered code for a different host', () => {
    const migrated = environment(`${MIGRATED_DEVICE_TOKEN_PREFIX}device-key-1`)
    expect(
      homeScreenPairingOffer(migrated, { ...pairedOffer, endpoint: 'wss://other.example/ws' })
    ).toBeNull()
    expect(
      homeScreenPairingOffer(migrated, { ...pairedOffer, publicKeyB64: 'other-key' })
    ).toBeNull()
  })
})
