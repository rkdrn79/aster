import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type {
  PhoneNotifySubscribeResult,
  PhoneNotifyVapidKeyResult
} from '../../../shared/phone-notify-contract'

const LOCAL_HOST = { kind: 'local' } as const

/** Where Web Push can run here: `unsupported` hides the switch, `home-screen` explains iOS's rule. */
export type PhoneNotifySupport = 'supported' | 'home-screen' | 'unsupported'

function isAppleTouchDevice(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  )
}

function isStandaloneApp(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Reflect.get(navigator, 'standalone') === true
  )
}

export function readPhoneNotifySupport(): PhoneNotifySupport {
  if (
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  ) {
    return 'supported'
  }
  // Why: iOS exposes Web Push only to a web app opened from the Home Screen, never to a tab.
  return isAppleTouchDevice() && !isStandaloneApp() ? 'home-screen' : 'unsupported'
}

function base64urlBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function sameKey(existing: ArrayBuffer | null, publicKey: string): boolean {
  if (!existing) {
    return false
  }
  const expected = base64urlBytes(publicKey)
  const actual = new Uint8Array(existing)
  return (
    actual.length === expected.length && actual.every((byte, index) => byte === expected[index])
  )
}

/** The host's VAPID key, or null when the host predates phone notifications or cannot send them. */
export async function readHostVapidKey(): Promise<string | null> {
  try {
    const result = await callRuntimeRpc<PhoneNotifyVapidKeyResult>(
      LOCAL_HOST,
      'phoneNotify.vapidKey'
    )
    return result.available ? result.publicKey : null
  } catch {
    // Why every error: an older host answers method_not_found, and either way there is no switch.
    return null
  }
}

export function registerPhoneNotifyWorker(): Promise<ServiceWorkerRegistration> {
  // Why relative: the hosted client lives under a folder (e.g. /app/), which becomes the scope.
  return navigator.serviceWorker.register('./sw.js', { scope: './' })
}

/** This browser's subscription for `publicKey`; one made for another host key is dropped. */
export async function readCurrentSubscription(
  registration: ServiceWorkerRegistration,
  publicKey: string
): Promise<PushSubscription | null> {
  const existing = await registration.pushManager.getSubscription()
  if (!existing || sameKey(existing.options.applicationServerKey, publicKey)) {
    return existing
  }
  await existing.unsubscribe().catch(() => false)
  return null
}

/** Must run inside the tap: iOS shows the permission prompt only for a user gesture. */
export function subscribeInGesture(
  registration: ServiceWorkerRegistration,
  publicKey: string
): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64urlBytes(publicKey)
  })
}

export async function sendSubscriptionToHost(
  subscription: PushSubscription,
  publicKey: string
): Promise<PhoneNotifySubscribeResult> {
  const { endpoint, keys } = subscription.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    return { subscribed: false, reason: 'invalid_keys' }
  }
  return callRuntimeRpc<PhoneNotifySubscribeResult>(LOCAL_HOST, 'phoneNotify.subscribe', {
    endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    applicationServerKey: publicKey,
    subject: window.location.origin
  })
}

export async function removeSubscription(registration: ServiceWorkerRegistration): Promise<void> {
  await callRuntimeRpc(LOCAL_HOST, 'phoneNotify.unsubscribe').catch(() => undefined)
  const existing = await registration.pushManager.getSubscription()
  await existing?.unsubscribe()
}
