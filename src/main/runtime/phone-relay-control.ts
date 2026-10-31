import type {
  PhoneRelayDevices,
  PhoneRelayPairing,
  PhoneRelayRevokeResult,
  PhoneRelayStatus
} from '../../shared/phone-relay-contract'
import { PRODUCT_NAME } from '../../shared/product-brand'

/** EXPERIMENT(relay): orcad's phone relay. The desktop app sets none, since only orcad joins a relay. */
export type PhoneRelayControl = {
  status(): PhoneRelayStatus
  configure(relayUrl: string | null): PhoneRelayStatus
  pair(webClientUrl: string | undefined): PhoneRelayPairing
  /** `callerDeviceId` is left out of both, so a caller never sees or revokes its own access. */
  devices(callerDeviceId: string | undefined): PhoneRelayDevices
  revoke(deviceId: string, callerDeviceId: string | undefined): PhoneRelayRevokeResult
}

let control: PhoneRelayControl | null = null

export function setPhoneRelayControl(next: PhoneRelayControl | null): void {
  control = next
}

export function requirePhoneRelayControl(): PhoneRelayControl {
  if (!control) {
    throw new Error(
      `Phone access needs this host to run ${PRODUCT_NAME}'s server; the desktop app cannot join a relay.`
    )
  }
  return control
}
