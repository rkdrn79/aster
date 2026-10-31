import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import { useAppStore } from '@/store'
import { runtimeHostConnectionStateForEntry } from '@/runtime/runtime-host-connection-state'
import { readStoredWebRuntimeEnvironment } from '@/web/web-runtime-environment'
import type { PhoneNotifySubscribeResult } from '../../../shared/phone-notify-contract'
import {
  readCurrentSubscription,
  readHostVapidKey,
  readPhoneNotifySupport,
  registerPhoneNotifyWorker,
  removeSubscription,
  sendSubscriptionToHost,
  subscribeInGesture
} from './phone-notify-push'

/**
 * The "Notify me" switch. `hidden` covers a browser without Web Push and a host without the
 * phoneNotify RPCs; `home-screen` is iOS in a Safari tab; `blocked` is a denied permission.
 */
export type PhoneNotifySetting =
  | { status: 'checking' }
  | { status: 'hidden' }
  | { status: 'home-screen' }
  | { status: 'blocked' }
  | { status: 'ready'; enabled: boolean; busy: boolean; error: string | null }

export const usePhoneNotifySetting = create<{ setting: PhoneNotifySetting }>(() => ({
  setting: { status: 'checking' }
}))

// Why outside the store: read synchronously in the tap, so nothing is awaited before subscribe.
let prepared: { registration: ServiceWorkerRegistration; publicKey: string } | null = null
let refreshing: Promise<void> | null = null

function setSetting(setting: PhoneNotifySetting): void {
  usePhoneNotifySetting.setState({ setting })
}

function refusalMessage(
  reason: Exclude<PhoneNotifySubscribeResult, { subscribed: true }>['reason']
): string {
  switch (reason) {
    case 'unsupported_endpoint':
      return 'The server does not accept this browser’s push service.'
    case 'stale_key':
      return 'The server changed its notification key. Try again.'
    case 'not_paired':
      return 'This phone is no longer paired with the server.'
    case 'invalid_keys':
    case 'unavailable':
    case 'storage_failed':
      return 'The server could not turn on notifications. Try again.'
  }
}

async function readSetting(): Promise<PhoneNotifySetting> {
  const support = readPhoneNotifySupport()
  if (support !== 'supported') {
    return { status: support === 'home-screen' ? 'home-screen' : 'hidden' }
  }
  const publicKey = await readHostVapidKey()
  if (!publicKey) {
    return { status: 'hidden' }
  }
  let registration: ServiceWorkerRegistration
  try {
    registration = await registerPhoneNotifyWorker()
  } catch {
    return { status: 'hidden' }
  }
  prepared = { registration, publicKey }
  if (Notification.permission === 'denied') {
    return { status: 'blocked' }
  }
  const subscription = await readCurrentSubscription(registration, publicKey).catch(() => null)
  if (!subscription || Notification.permission !== 'granted') {
    return { status: 'ready', enabled: false, busy: false, error: null }
  }
  // Why resend on every open: a host that lost its copy (reset or re-keyed) heals here.
  const result = await sendSubscriptionToHost(subscription, publicKey).catch(() => null)
  const enabled = result === null || result.subscribed
  return { status: 'ready', enabled, busy: false, error: null }
}

/** Reads support, the host key and this browser's subscription; concurrent calls share one read. */
export function refreshPhoneNotifySetting(): Promise<void> {
  refreshing ??= readSetting()
    .then(setSetting)
    .catch(() => setSetting({ status: 'hidden' }))
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

function settle(enabled: boolean, error: string | null): void {
  setSetting({ status: 'ready', enabled, busy: false, error })
}

/** Runs in the menu tap. Turning on subscribes first, before any await, as iOS requires. */
export function togglePhoneNotify(): void {
  const { setting } = usePhoneNotifySetting.getState()
  if (setting.status !== 'ready' || setting.busy || !prepared) {
    return
  }
  const { registration, publicKey } = prepared
  if (setting.enabled) {
    setSetting({ ...setting, busy: true, error: null })
    removeSubscription(registration).then(
      () => settle(false, null),
      () => settle(true, 'Could not turn off notifications. Try again.')
    )
    return
  }
  const subscribing = subscribeInGesture(registration, publicKey)
  setSetting({ ...setting, busy: true, error: null })
  subscribing
    .then(async (subscription) => {
      const result = await sendSubscriptionToHost(subscription, publicKey)
      if (result.subscribed) {
        settle(true, null)
        return
      }
      await subscription.unsubscribe().catch(() => false)
      settle(false, refusalMessage(result.reason))
    })
    .catch(() => {
      if (Notification.permission === 'denied') {
        setSetting({ status: 'blocked' })
        return
      }
      settle(false, 'Could not turn on notifications. Check that the server is connected.')
    })
}

/** Re-reads the switch whenever the host connects and whenever the app comes back to the front. */
export function usePhoneNotifySettingSync(): void {
  const environment = useMemo(() => readStoredWebRuntimeEnvironment(), [])
  const connected = useAppStore((state) => {
    const entry = environment ? state.runtimeStatusByEnvironmentId.get(environment.id) : undefined
    return entry ? runtimeHostConnectionStateForEntry(entry) === 'connected' : false
  })
  useEffect(() => {
    if (connected) {
      void refreshPhoneNotifySetting()
    }
  }, [connected])
  useEffect(() => {
    // Why: the permission may have been changed in iOS Settings while the app was away.
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        void refreshPhoneNotifySetting()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
}
