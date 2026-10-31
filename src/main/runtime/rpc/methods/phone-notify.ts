import { defineMethod } from '../core'
import type {
  PhoneNotifySubscribeResult,
  PhoneNotifyVapidKeyResult
} from '../../../../shared/phone-notify-contract'
import { PhoneNotifySubscribeParams } from '../../../../shared/rpc-contract/phone-notify-params'
import { getPhoneNotifyControl } from '../../phone-notify/phone-notify-control'

// Why device-self: each call reads or changes only the caller's own subscription, keyed by the
// transport-stamped paired device, so a caller without one (in-process, CLI) has nothing to touch.
export const PHONE_NOTIFY_METHODS = [
  defineMethod({
    name: 'phoneNotify.vapidKey',
    permission: 'device-self',
    params: null,
    handler: async (_params, { pairedDeviceId }): Promise<PhoneNotifyVapidKeyResult> => {
      const control = getPhoneNotifyControl()
      return control && pairedDeviceId
        ? { available: true, publicKey: control.vapidPublicKey() }
        : { available: false }
    }
  }),
  defineMethod({
    name: 'phoneNotify.subscribe',
    permission: 'device-self',
    params: PhoneNotifySubscribeParams,
    handler: async (params, { pairedDeviceId }): Promise<PhoneNotifySubscribeResult> => {
      if (!pairedDeviceId) {
        return { subscribed: false, reason: 'not_paired' }
      }
      const control = getPhoneNotifyControl()
      return control
        ? control.subscribe(pairedDeviceId, params)
        : { subscribed: false, reason: 'unavailable' }
    }
  }),
  defineMethod({
    name: 'phoneNotify.unsubscribe',
    permission: 'device-self',
    params: null,
    handler: async (_params, { pairedDeviceId }) =>
      pairedDeviceId
        ? (getPhoneNotifyControl()?.unsubscribe(pairedDeviceId) ?? { unsubscribed: false })
        : { unsubscribed: false }
  })
]
