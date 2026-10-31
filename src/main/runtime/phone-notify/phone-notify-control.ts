import type { PhoneNotifyService } from './phone-notify-service'

/** Set only by orcad, the host a phone reaches through a relay; the desktop app sends no Web Push. */
export type PhoneNotifyControl = Pick<
  PhoneNotifyService,
  'vapidPublicKey' | 'subscribe' | 'unsubscribe'
>

let control: PhoneNotifyControl | null = null

export function setPhoneNotifyControl(next: PhoneNotifyControl | null): void {
  control = next
}

export function getPhoneNotifyControl(): PhoneNotifyControl | null {
  return control
}
