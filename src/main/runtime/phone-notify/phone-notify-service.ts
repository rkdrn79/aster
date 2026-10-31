// Why: the host's own Web Push to paired phones. orcad has outbound HTTPS, so it signs and
// encrypts each alert itself and posts it straight to the phone's push service; no gateway.
import { reserveNotificationCooldown } from '../../../shared/notification-burst-cooldown'
import type { PhoneNotifySubscribeResult } from '../../../shared/phone-notify-contract'
import type { MobileNotificationEvent } from '../runtime-mobile-notification-controller'
import { isPushServiceEndpoint, sendWebPush } from '../web-push/web-push-send'
import type { VapidKeys } from '../web-push/web-push-vapid'
import type { PhoneNotifySubscription } from './phone-notify-files'
import {
  agentNeedsYouMessage,
  runEndedMessage,
  type PhoneNotifyMessage,
  type PhoneNotifyRunEnd
} from './phone-notify-messages'
import type { PhoneNotifySubscriptionStore } from './phone-notify-subscription-store'

const DEDUPE_WINDOW_MS = 10 * 60_000
const MAX_REMEMBERED_IDS = 200
const RATE_WINDOW_MS = 60 * 60_000
const MAX_PUSHES_PER_DEVICE_PER_WINDOW = 30
const RETRY_DELAY_MS = 2_000
// Why an hour: a question older than that is better found by opening the app than by a late alert.
const PUSH_TTL_SECONDS = 60 * 60

export type PhoneNotifySubscribeInput = {
  endpoint: string
  keys: { p256dh: string; auth: string }
  applicationServerKey: string
  subject: string
}

type PhoneNotifyServiceOptions = {
  store: PhoneNotifySubscriptionStore
  vapid: VapidKeys
  isPairedDevice: (deviceId: string) => boolean
  /** Test seams: a fake push endpoint, a fixed clock, and an immediate retry. */
  fetchImpl?: typeof globalThis.fetch
  now?: () => number
  scheduleRetry?: (run: () => void, delayMs: number) => void
}

function hasKeyLength(value: string, length: number, firstByte?: number): boolean {
  const bytes = Buffer.from(value, 'base64url')
  return bytes.length === length && (firstByte === undefined || bytes[0] === firstByte)
}

export class PhoneNotifyService {
  private readonly sentIds = new Map<string, number>()
  private readonly cooldowns = new Map<string, number>()
  private readonly sentAtByDevice = new Map<string, number[]>()
  private readonly fetchImpl: typeof globalThis.fetch
  private readonly now: () => number
  private readonly scheduleRetry: (run: () => void, delayMs: number) => void
  private stopped = false

  constructor(private readonly options: PhoneNotifyServiceOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.now = options.now ?? Date.now
    this.scheduleRetry =
      options.scheduleRetry ??
      ((run, delayMs) => {
        // A pending retry must never hold the host open at shutdown.
        setTimeout(run, delayMs).unref?.()
      })
  }

  vapidPublicKey(): string {
    return this.options.vapid.publicKey
  }

  stop(): void {
    this.stopped = true
  }

  subscribe(deviceId: string, input: PhoneNotifySubscribeInput): PhoneNotifySubscribeResult {
    if (!this.options.isPairedDevice(deviceId)) {
      return { subscribed: false, reason: 'not_paired' }
    }
    if (!isPushServiceEndpoint(input.endpoint)) {
      return { subscribed: false, reason: 'unsupported_endpoint' }
    }
    if (!hasKeyLength(input.keys.p256dh, 65, 0x04) || !hasKeyLength(input.keys.auth, 16)) {
      return { subscribed: false, reason: 'invalid_keys' }
    }
    if (input.applicationServerKey !== this.options.vapid.publicKey) {
      return { subscribed: false, reason: 'stale_key' }
    }
    const subject = new URL(input.subject)
    try {
      this.options.store.put({
        deviceId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        subject: subject.protocol === 'mailto:' ? subject.href : subject.origin,
        vapidPublicKey: this.options.vapid.publicKey,
        createdAt: this.now()
      })
    } catch (error) {
      console.warn('[phone-notify] Failed to store a subscription:', error)
      return { subscribed: false, reason: 'storage_failed' }
    }
    return { subscribed: true }
  }

  unsubscribe(deviceId: string): { unsubscribed: boolean } {
    try {
      return { unsubscribed: this.options.store.removeDevice(deviceId) }
    } catch (error) {
      console.warn('[phone-notify] Failed to remove a subscription:', error)
      return { unsubscribed: false }
    }
  }

  /** Live subscriptions: a revoked device's, or one made with a replaced key, is dropped here. */
  activeSubscriptions(): readonly PhoneNotifySubscription[] {
    const keep = (entry: PhoneNotifySubscription): boolean =>
      this.options.isPairedDevice(entry.deviceId) &&
      entry.vapidPublicKey === this.options.vapid.publicKey
    try {
      this.options.store.retain(keep)
    } catch (error) {
      console.warn('[phone-notify] Failed to prune subscriptions:', error)
    }
    return this.options.store.list().filter(keep)
  }

  /** Fed every host notification; only an agent that starts waiting on the user is pushed. */
  notifyDispatched(event: MobileNotificationEvent): Promise<void> {
    const message = agentNeedsYouMessage(event)
    return message ? this.send(message) : Promise.resolve()
  }

  notifyRunEnded(run: PhoneNotifyRunEnd): Promise<void> {
    return this.send(runEndedMessage(run))
  }

  private async send(message: PhoneNotifyMessage): Promise<void> {
    if (this.stopped) {
      return
    }
    const now = this.now()
    if (!this.rememberId(message.payload.id, now)) {
      return
    }
    const payload = JSON.stringify(message.payload)
    const targets = this.activeSubscriptions().filter(
      (entry) =>
        reserveNotificationCooldown(
          this.cooldowns,
          JSON.stringify([entry.deviceId, message.cooldownKey]),
          now
        ) && this.admitForDevice(entry.deviceId, now)
    )
    await Promise.all(targets.map((entry) => this.deliver(entry, payload, message.urgency, 0)))
  }

  private async deliver(
    subscription: PhoneNotifySubscription,
    payload: string,
    urgency: PhoneNotifyMessage['urgency'],
    attempt: number
  ): Promise<void> {
    if (this.stopped) {
      return
    }
    try {
      const { outcome, status } = await sendWebPush({
        subscription,
        payload,
        vapid: this.options.vapid,
        ttlSeconds: PUSH_TTL_SECONDS,
        urgency,
        fetchImpl: this.fetchImpl,
        nowMs: this.now()
      })
      if (outcome === 'gone') {
        this.options.store.removeEndpoint(subscription.endpoint)
      } else if (outcome === 'unreachable' && attempt === 0) {
        await new Promise<void>((resolve) => {
          this.scheduleRetry(() => {
            void this.deliver(subscription, payload, urgency, 1).finally(resolve)
          }, RETRY_DELAY_MS)
        })
      } else if (outcome !== 'delivered') {
        console.warn(`[phone-notify] The push service refused a notification (${status ?? '-'})`)
      }
    } catch (error) {
      console.warn('[phone-notify] Push send failed:', error)
    }
  }

  /** False for an id already pushed within the dedupe window. */
  private rememberId(id: string, now: number): boolean {
    const sentAt = this.sentIds.get(id)
    if (sentAt !== undefined && now - sentAt < DEDUPE_WINDOW_MS) {
      return false
    }
    this.sentIds.delete(id)
    this.sentIds.set(id, now)
    if (this.sentIds.size > MAX_REMEMBERED_IDS) {
      for (const [key, at] of this.sentIds) {
        if (now - at >= DEDUPE_WINDOW_MS || this.sentIds.size > MAX_REMEMBERED_IDS) {
          this.sentIds.delete(key)
        }
      }
    }
    return true
  }

  private admitForDevice(deviceId: string, now: number): boolean {
    const recent = (this.sentAtByDevice.get(deviceId) ?? []).filter(
      (at) => now - at < RATE_WINDOW_MS
    )
    if (recent.length >= MAX_PUSHES_PER_DEVICE_PER_WINDOW) {
      this.sentAtByDevice.set(deviceId, recent)
      return false
    }
    this.sentAtByDevice.set(deviceId, [...recent, now])
    return true
  }
}
