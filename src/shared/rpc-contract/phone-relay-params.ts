import { z } from 'zod'
import { OptionalString } from './rpc-param-primitives'

export const PhoneRelayConfigureParams = z.object({
  /** An Aster relay URL (wss://…/ws?key=…); null turns phone access off on this host. */
  relayUrl: z.string().min(1).nullable()
})

export const PhoneRelayPairParams = z.object({
  /** The hosted web client the pairing link opens; the Aster site's copy when absent. */
  webClientUrl: OptionalString
})

export const PhoneRelayRevokeParams = z.object({
  /** A deviceId from phoneRelay.devices. */
  deviceId: z.string().min(1).max(128)
})
