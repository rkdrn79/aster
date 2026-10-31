import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadOrCreateVapidKeys, type PhoneNotifySubscription } from './phone-notify-files'
import { PhoneNotifySubscriptionStore } from './phone-notify-subscription-store'

let userDataPath = ''

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'phone-notify-store-'))
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

function subscription(deviceId: string, endpoint: string): PhoneNotifySubscription {
  return {
    deviceId,
    endpoint,
    p256dh: 'p256dh',
    auth: 'auth',
    subject: 'https://rkdrn79.github.io',
    vapidPublicKey: 'key',
    createdAt: 1
  }
}

describe('PhoneNotifySubscriptionStore', () => {
  it('keeps one subscription per device and moves a reused endpoint to its new device', () => {
    const store = new PhoneNotifySubscriptionStore(userDataPath)
    store.put(subscription('phone-a', 'https://web.push.apple.com/1'))
    store.put(subscription('phone-a', 'https://web.push.apple.com/2'))
    store.put(subscription('phone-b', 'https://web.push.apple.com/2'))
    expect(store.list().map((entry) => [entry.deviceId, entry.endpoint])).toEqual([
      ['phone-b', 'https://web.push.apple.com/2']
    ])
  })

  it('persists owner-only and reloads after a restart', () => {
    const store = new PhoneNotifySubscriptionStore(userDataPath)
    store.put(subscription('phone-a', 'https://web.push.apple.com/1'))
    store.put(subscription('phone-b', 'https://fcm.googleapis.com/wp/2'))
    expect(store.removeDevice('phone-a')).toBe(true)
    expect(store.removeEndpoint('https://fcm.googleapis.com/wp/9')).toBe(false)
    const file = join(userDataPath, 'phone-notify-subscriptions.json')
    if (process.platform !== 'win32') {
      expect(statSync(file).mode & 0o077).toBe(0)
    }
    expect(new PhoneNotifySubscriptionStore(userDataPath).list()).toEqual([
      subscription('phone-b', 'https://fcm.googleapis.com/wp/2')
    ])
  })

  it('starts empty from a damaged file instead of failing the host', () => {
    writeFileSync(join(userDataPath, 'phone-notify-subscriptions.json'), '{not json')
    expect(new PhoneNotifySubscriptionStore(userDataPath).list()).toEqual([])
  })
})

describe('loadOrCreateVapidKeys', () => {
  it('makes the key once, owner-only, and returns the same key after a restart', () => {
    const first = loadOrCreateVapidKeys(userDataPath)
    const file = join(userDataPath, 'phone-notify-vapid.json')
    if (process.platform !== 'win32') {
      expect(statSync(file).mode & 0o077).toBe(0)
    }
    expect(readFileSync(file, 'utf8')).toContain('"d"')
    expect(loadOrCreateVapidKeys(userDataPath).publicKey).toBe(first.publicKey)
  })
})
