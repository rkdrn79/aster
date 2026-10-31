import type { PhoneRelayDevice } from '../../shared/phone-relay-contract'
import type { DeviceEntry } from './device-entry'

/** The name phoneRelay.pair gives a link: `Phone <locale date>`. */
export function phoneAccessDeviceName(now: Date): string {
  return `Phone ${now.toLocaleDateString()}`
}

// Why a name fallback: links minted before rows carried pairingOrigin have only pair()'s name.
const UNMARKED_PHONE_LINK_NAME = /^Phone [\d./\s-]+$/

/** A phone pairing link: the token row pair() minted, plus each browser installation forked from it. */
export type PhoneAccessPairing = { link: DeviceEntry; installations: DeviceEntry[] }

function isPhoneAccessLink(device: DeviceEntry): boolean {
  if (device.scope !== 'runtime' || device.parentDeviceId !== undefined) {
    return false
  }
  if (device.pairingOrigin === 'phone-access') {
    return device.forkedFrom === undefined
  }
  return (
    device.pairingOrigin === undefined &&
    device.credentialKind === undefined &&
    (device.grants ?? []).length === 0 &&
    UNMARKED_PHONE_LINK_NAME.test(device.name)
  )
}

/**
 * Phones paired through phone access, grouped by link. A pairing that includes the caller is left
 * out, so a managing desktop (or a phone) can never list or revoke its own access this way.
 */
export function listPhoneAccessPairings(
  devices: readonly DeviceEntry[],
  callerDeviceId: string | undefined
): PhoneAccessPairing[] {
  const pairings = new Map<string, PhoneAccessPairing>()
  for (const device of devices) {
    if (isPhoneAccessLink(device)) {
      pairings.set(device.deviceId, { link: device, installations: [] })
    }
  }
  for (const device of devices) {
    const pairing = device.forkedFrom ? pairings.get(device.forkedFrom) : undefined
    if (pairing) {
      pairing.installations.push(device)
    } else if (device.pairingOrigin === 'phone-access' && device.forkedFrom !== undefined) {
      // Why: an installation whose link is gone still holds its own key, so it stays revocable.
      pairings.set(device.deviceId, { link: device, installations: [] })
    }
  }
  return [...pairings.values()].filter(
    (pairing) =>
      callerDeviceId === undefined ||
      ![pairing.link, ...pairing.installations].some((device) => device.deviceId === callerDeviceId)
  )
}

export function toPhoneRelayDevice(pairing: PhoneAccessPairing): PhoneRelayDevice {
  const members = [pairing.link, ...pairing.installations]
  const lastSeenAt = Math.max(...members.map((device) => device.lastSeenAt))
  const labels = [...new Set(pairing.installations.map((device) => device.name))]
  return {
    deviceId: pairing.link.deviceId,
    name: labels.length > 0 ? labels.join(', ') : pairing.link.name,
    pairedAt: pairing.link.pairedAt,
    lastSeenAt: lastSeenAt > 0 ? lastSeenAt : null
  }
}
