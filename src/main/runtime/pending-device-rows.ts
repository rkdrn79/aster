import type { DeviceScope } from '../../shared/runtime-types'
import type { RuntimePairingReach } from '../../shared/runtime-pairing-reach'
import { mintDeviceCredential } from './device-credential'
import {
  isPendingTokenRow,
  sameGrants,
  type DeviceEntry,
  type DevicePairingOrigin,
  type TokenDeviceEntry
} from './device-entry'
import { validGrants } from './device-registry-row-validation'
import type { RuntimeDeviceGrant } from './rpc/rpc-method-permission'

/** What a pairing offer asks the registry to mint (or reuse) as its never-scanned token row. */
export type PendingDeviceRequest = {
  name: string
  scope: DeviceScope
  pairingReach: RuntimePairingReach
  grants: readonly RuntimeDeviceGrant[]
  origin: DevicePairingOrigin | undefined
}

export function mintPendingTokenRow(request: PendingDeviceRequest): TokenDeviceEntry {
  const grants = validGrants(request.grants, request.scope)
  return {
    ...mintDeviceCredential(),
    name: request.name,
    scope: request.scope,
    pairedAt: Date.now(),
    lastSeenAt: 0,
    pairingReach: request.pairingReach,
    ...(grants ? { grants } : {}),
    ...(request.origin ? { pairingOrigin: request.origin } : {})
  }
}

/** Why same grants and origin: re-advertising a pending token never widens it or changes its owner. */
export function findReusablePendingRow(
  devices: readonly DeviceEntry[],
  request: PendingDeviceRequest
): TokenDeviceEntry | undefined {
  const grants = validGrants(request.grants, request.scope) ?? []
  return devices.find(
    (device): device is TokenDeviceEntry =>
      isPendingTokenRow(device) &&
      device.scope === request.scope &&
      device.pairingOrigin === request.origin &&
      sameGrants(device, grants)
  )
}

/**
 * Rows a rotation keeps: every scanned row, and pending rows of another scope. A marked link retires
 * only links of its own origin, so a phone QR never drops the startup offer a desktop pairs from.
 */
export function rowsKeptByRotation(
  devices: readonly DeviceEntry[],
  request: PendingDeviceRequest
): DeviceEntry[] {
  return devices.filter(
    (device) =>
      !isPendingTokenRow(device) ||
      device.scope !== request.scope ||
      (request.origin !== undefined && device.pairingOrigin !== request.origin)
  )
}
