import { defineMethod } from '../core'
import {
  PhoneRelayConfigureParams,
  PhoneRelayPairParams,
  PhoneRelayRevokeParams
} from '../../../../shared/rpc-contract/phone-relay-params'
import { requirePhoneRelayControl } from '../../phone-relay-control'

// Why host-admin, not pairing-admin: the desktop managing this host is a paired client and the only
// one that can show a phone its QR. It already runs commands here, and the offer carries no grants.
// A phone paired through phone access is refused all of these (rpc-caller-scope.ts).
export const PHONE_RELAY_METHODS = [
  defineMethod({
    name: 'phoneRelay.status',
    permission: 'host-admin',
    params: null,
    handler: async () => requirePhoneRelayControl().status()
  }),
  defineMethod({
    name: 'phoneRelay.configure',
    permission: 'host-admin',
    params: PhoneRelayConfigureParams,
    handler: async (params) => requirePhoneRelayControl().configure(params.relayUrl)
  }),
  defineMethod({
    name: 'phoneRelay.pair',
    permission: 'host-admin',
    params: PhoneRelayPairParams,
    handler: async (params) => requirePhoneRelayControl().pair(params.webClientUrl)
  }),
  defineMethod({
    name: 'phoneRelay.devices',
    permission: 'host-admin',
    params: null,
    handler: async (_params, context) => requirePhoneRelayControl().devices(context.pairedDeviceId)
  }),
  defineMethod({
    name: 'phoneRelay.revoke',
    permission: 'host-admin',
    params: PhoneRelayRevokeParams,
    handler: async (params, context) =>
      requirePhoneRelayControl().revoke(params.deviceId, context.pairedDeviceId)
  })
]
