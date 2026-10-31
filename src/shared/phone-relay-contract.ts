/** EXPERIMENT(relay): phone access to a host through the user's own relay. */
export type PhoneRelayStatus = {
  /** The relay's host name while phone access is on; null while it is off. */
  relayHost: string | null
}

export type PhoneRelayPairing = {
  /** The hosted web client link a phone opens; it carries the pairing offer in its fragment. */
  webClientUrl: string
  pairingUrl: string
}

/** One phone pairing link and every browser that opened it, revoked together. */
export type PhoneRelayDevice = {
  deviceId: string
  name: string
  pairedAt: number
  /** Null while nobody has opened the pairing link yet. */
  lastSeenAt: number | null
}

export type PhoneRelayDevices = { devices: PhoneRelayDevice[] }

export type PhoneRelayRevokeResult = { revoked: boolean }
