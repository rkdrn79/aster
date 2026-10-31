import {
  readPhoneNotifySubscriptions,
  writePhoneNotifySubscriptions,
  type PhoneNotifySubscription
} from './phone-notify-files'

// Why a cap: each subscription costs a POST per alert, and a host serves one person's phones.
const MAX_SUBSCRIPTIONS = 32

/** Web Push subscriptions, one per paired device, persisted before memory changes. */
export class PhoneNotifySubscriptionStore {
  private subscriptions: readonly PhoneNotifySubscription[]
  private readonly unreadable: boolean

  constructor(private readonly userDataPath: string) {
    const read = readPhoneNotifySubscriptions(userDataPath)
    this.unreadable = read === null
    this.subscriptions = read ?? []
  }

  list(): readonly PhoneNotifySubscription[] {
    return this.subscriptions
  }

  /** Replaces the device's subscription; an endpoint another device held moves to this one. */
  put(subscription: PhoneNotifySubscription): void {
    const others = this.subscriptions.filter(
      (entry) =>
        entry.deviceId !== subscription.deviceId && entry.endpoint !== subscription.endpoint
    )
    this.replace([...others, subscription].slice(-MAX_SUBSCRIPTIONS))
  }

  removeDevice(deviceId: string): boolean {
    return this.retain((entry) => entry.deviceId !== deviceId)
  }

  removeEndpoint(endpoint: string): boolean {
    return this.retain((entry) => entry.endpoint !== endpoint)
  }

  /** Keeps only what `keep` accepts; true when anything was dropped. */
  retain(keep: (subscription: PhoneNotifySubscription) => boolean): boolean {
    const next = this.subscriptions.filter(keep)
    if (next.length === this.subscriptions.length) {
      return false
    }
    this.replace(next)
    return true
  }

  private replace(next: readonly PhoneNotifySubscription[]): void {
    if (this.unreadable) {
      throw new Error(
        'The phone notification subscriptions file cannot be read; not overwriting it.'
      )
    }
    writePhoneNotifySubscriptions(this.userDataPath, next)
    this.subscriptions = next
  }
}
