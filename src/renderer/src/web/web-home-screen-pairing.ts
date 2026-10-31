import { withPairingFragment } from '../../../shared/hosted-web-client'
import {
  encodePairingOffer,
  PAIRING_OFFER_VERSION,
  type PairingOffer
} from '../../../shared/pairing'
import type { WebPairingOffer } from './web-pairing'
import { MIGRATED_DEVICE_TOKEN_PREFIX } from './web-runtime-credential-source'
import {
  readStoredWebRuntimeEnvironment,
  type StoredWebRuntimeEnvironment
} from './web-runtime-environment'

// Why memory only: once a device key replaces the stored code, the code is never written down again.
let pairedThisPage: WebPairingOffer | null = null

/** Keeps the offer this page just paired with, so the Home Screen app can pair from this tab. */
export function rememberWebPairingOffer(offer: WebPairingOffer): void {
  pairedThisPage = offer
}

/**
 * The runtime offer another installation of this browser's user can pair with: the stored code
 * while this browser keeps one, else the code this page paired with when it names the same host.
 * Null once a device key replaced the code and this page did not pair. The host keeps a token's
 * row when an installation forks a key from it, so a second installation may present it too.
 */
export function homeScreenPairingOffer(
  environment: Pick<StoredWebRuntimeEnvironment, 'endpoints' | 'preferredEndpointId'> &
    Partial<Pick<StoredWebRuntimeEnvironment, 'hostDescriptor'>>,
  pairedOffer: WebPairingOffer | null
): PairingOffer | null {
  const endpoint =
    environment.endpoints.find((entry) => entry.id === environment.preferredEndpointId) ??
    environment.endpoints[0]
  if (!endpoint) {
    return null
  }
  if (!endpoint.deviceToken.startsWith(MIGRATED_DEVICE_TOKEN_PREFIX)) {
    return {
      v: PAIRING_OFFER_VERSION,
      endpoint: endpoint.endpoint,
      deviceToken: endpoint.deviceToken,
      publicKeyB64: endpoint.publicKeyB64,
      scope: 'runtime',
      ...(environment.hostDescriptor ? { hostDescriptor: environment.hostDescriptor } : {})
    }
  }
  if (
    pairedOffer?.endpoint !== endpoint.endpoint ||
    pairedOffer.publicKeyB64 !== endpoint.publicKeyB64
  ) {
    return null
  }
  return { ...pairedOffer, scope: 'runtime' }
}

/** The hosted web client link that pairs whoever opens or pastes it, as orcad's own QR does. */
export function homeScreenPairingLink(webClientUrl: string, offer: PairingOffer): string {
  return withPairingFragment(webClientUrl, encodePairingOffer(offer))
}

/** This page's pairing link for the Home Screen app, or null when it no longer knows the code. */
export function readHomeScreenPairingLink(): string | null {
  const environment = readStoredWebRuntimeEnvironment()
  const offer = environment ? homeScreenPairingOffer(environment, pairedThisPage) : null
  if (!offer) {
    return null
  }
  try {
    return homeScreenPairingLink(`${window.location.origin}${window.location.pathname}`, offer)
  } catch (error) {
    console.warn('[web] Could not build the Home Screen pairing link', error)
    return null
  }
}
