import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MobileNotificationDispatchEvent } from '../runtime-mobile-notification-controller'
import { createWebPushReceiver } from '../web-push/web-push-receiver.test-fixture'
import { generateVapidJwk, vapidKeysFromJwk } from '../web-push/web-push-vapid'
import { PhoneNotifyService } from './phone-notify-service'
import { PhoneNotifySubscriptionStore } from './phone-notify-subscription-store'

const APPLE_ORIGIN = 'https://web.push.apple.com'
const ENDPOINT = `${APPLE_ORIGIN}/QGuQyavXutnMH8ab`
const WORKTREE = 'repo::/work/proj'

type CapturedPush = { method: string; path: string; headers: IncomingHttpHeaders; body: Buffer }

let userDataPath = ''
let server: Server
let fakeOrigin = ''
let pushes: CapturedPush[] = []
let statuses: number[] = []

beforeEach(async () => {
  userDataPath = mkdtempSync(join(tmpdir(), 'phone-notify-service-'))
  pushes = []
  statuses = []
  // The fake push service: records each request and answers with the next queued status.
  server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      pushes.push({
        method: request.method ?? '',
        path: request.url ?? '',
        headers: request.headers,
        body: Buffer.concat(chunks)
      })
      response.statusCode = statuses.shift() ?? 201
      response.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('expected a TCP address')
  }
  fakeOrigin = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  rmSync(userDataPath, { recursive: true, force: true })
})

// Why a rewrite: the host signs for Apple's origin as it would live, but the bytes land here.
const fetchToFakeService: typeof globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  return globalThis.fetch(url.replace(APPLE_ORIGIN, fakeOrigin), init)
}

function createService(paired: Set<string>) {
  const vapid = vapidKeysFromJwk(generateVapidJwk())
  if (!vapid) {
    throw new Error('expected a VAPID key')
  }
  const store = new PhoneNotifySubscriptionStore(userDataPath)
  const service = new PhoneNotifyService({
    store,
    vapid,
    isPairedDevice: (deviceId) => paired.has(deviceId),
    fetchImpl: fetchToFakeService,
    now: () => Date.UTC(2026, 9, 30, 2, 0, 0),
    scheduleRetry: (run) => run()
  })
  const receiver = createWebPushReceiver()
  const subscribe = (
    overrides: Partial<Parameters<PhoneNotifyService['subscribe']>[1]> = {},
    deviceId = 'phone-a'
  ) =>
    service.subscribe(deviceId, {
      endpoint: ENDPOINT,
      keys: receiver.keys,
      applicationServerKey: vapid.publicKey,
      subject: 'https://rkdrn79.github.io/aster-site/app/web-index.html',
      ...overrides
    })
  return { service, store, vapid, receiver, subscribe }
}

const needsYou: MobileNotificationDispatchEvent = {
  type: 'notification',
  source: 'agent-task-complete',
  title: 'proj / main - Claude needs input',
  body: 'Delete the checkpoints in /data/private-run?',
  worktreeId: WORKTREE,
  notificationId: 'agent:pane-1:100',
  agentState: 'waiting',
  emittedAt: 100
}

describe('PhoneNotifyService', () => {
  it('refuses endpoints that are not push services, bad keys, stale keys and unpaired callers', () => {
    const { subscribe } = createService(new Set(['phone-a']))
    expect(subscribe({ endpoint: 'http://web.push.apple.com/x' })).toMatchObject({
      reason: 'unsupported_endpoint'
    })
    for (const endpoint of [
      'https://169.254.169.254/latest',
      'https://web.push.apple.com.attacker.example/x',
      'https://user@web.push.apple.com/x',
      'https://fcm.googleapis.com:8443/fcm/send/x'
    ]) {
      expect(subscribe({ endpoint }), endpoint).toMatchObject({ reason: 'unsupported_endpoint' })
    }
    expect(subscribe({ keys: { p256dh: 'AAAA', auth: 'AAAA' } })).toMatchObject({
      reason: 'invalid_keys'
    })
    expect(subscribe({ applicationServerKey: 'older-key' })).toMatchObject({ reason: 'stale_key' })
    expect(subscribe({}, 'phone-z')).toMatchObject({ reason: 'not_paired' })
    expect(subscribe()).toEqual({ subscribed: true })
  })

  it('pushes Needs you as an encrypted, VAPID-signed request without the agent’s words', async () => {
    const { service, vapid, receiver, subscribe } = createService(new Set(['phone-a']))
    subscribe()
    await service.notifyDispatched(needsYou)
    expect(pushes).toHaveLength(1)
    const [push] = pushes
    expect(push.method).toBe('POST')
    expect(push.path).toBe('/QGuQyavXutnMH8ab')
    expect(push.headers).toMatchObject({
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '3600',
      urgency: 'high'
    })
    const authorization = /^vapid t=([^,]+), k=(.+)$/.exec(push.headers.authorization ?? '')
    expect(authorization?.[2]).toBe(vapid.publicKey)
    const claims: unknown = JSON.parse(
      Buffer.from(authorization?.[1].split('.')[1] ?? '', 'base64url').toString('utf8')
    )
    expect(claims).toMatchObject({ aud: APPLE_ORIGIN, sub: 'https://rkdrn79.github.io' })
    const payload = receiver.decrypt(push.body)
    expect(JSON.parse(payload)).toEqual({
      v: 1,
      id: 'agent:pane-1:100',
      title: 'proj / main - Claude needs input',
      body: 'Needs you',
      target: { kind: 'session', worktreeId: WORKTREE }
    })
    expect(payload).not.toContain('checkpoints')
  })

  it('stays quiet for finished turns, muted notifications and repeats', async () => {
    const { service, subscribe } = createService(new Set(['phone-a']))
    subscribe()
    await service.notifyDispatched({ ...needsYou, agentState: 'done', notificationId: 'done-1' })
    await service.notifyDispatched({ ...needsYou, desktopAllowed: false, notificationId: 'm-1' })
    await service.notifyDispatched({ ...needsYou, source: 'terminal-bell', notificationId: 'b-1' })
    await service.notifyDispatched(needsYou)
    await service.notifyDispatched(needsYou)
    expect(pushes).toHaveLength(1)
  })

  it('drops a subscription the push service forgot, and one whose device was revoked', async () => {
    const paired = new Set(['phone-a'])
    const first = createService(paired)
    first.subscribe()
    statuses = [410]
    await first.service.notifyDispatched(needsYou)
    expect(first.store.list()).toEqual([])

    first.subscribe()
    paired.delete('phone-a')
    await first.service.notifyDispatched({ ...needsYou, notificationId: 'agent:pane-1:200' })
    expect(pushes).toHaveLength(1)
    expect(first.store.list()).toEqual([])
  })

  it('retries once when the push service is briefly unavailable', async () => {
    const { service, subscribe } = createService(new Set(['phone-a']))
    subscribe()
    statuses = [503, 201]
    await service.notifyDispatched(needsYou)
    expect(pushes).toHaveLength(2)
  })

  it('pushes a Run that ended, opening that Run', async () => {
    const { service, receiver, subscribe } = createService(new Set(['phone-a']))
    subscribe()
    await service.notifyRunEnded({
      worktreeId: WORKTREE,
      experiment: 'lr-sweep',
      experimentName: 'LR sweep',
      run: 'run-7',
      runName: 'lr=3e-4',
      state: 'failed'
    })
    expect(pushes[0]?.headers.urgency).toBe('normal')
    expect(JSON.parse(receiver.decrypt(pushes[0].body))).toMatchObject({
      title: 'lr=3e-4',
      body: 'Run failed · LR sweep',
      target: { kind: 'run', worktreeId: WORKTREE, experiment: 'lr-sweep', run: 'run-7' }
    })
  })
})
