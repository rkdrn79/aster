import '../runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nacl from 'tweetnacl'
import WebSocket from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePairingCode } from '../../shared/pairing'
import { HOSTED_WEB_CLIENT_URL } from '../../shared/hosted-web-client'
import { SimulatedMobileE2EEV2Peer } from '../runtime/mobile-cloud-relay/simulated-mobile-e2ee-v2-peer'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import { FakeRelay } from '../runtime/rpc/fake-relay.test-fixture'
import { STATUS_METHODS } from '../runtime/rpc/methods/status'
import { buildServePairingReadiness } from '../server/serve-pairing-readiness'
import {
  ORCAD_RELAY_SERVER_ID_FILENAME,
  ORCAD_RELAY_URL_FILENAME,
  OrcadPhoneRelay,
  readConfiguredRelayUrl,
  readOrCreateRelayServerId,
  startOrcadRelay,
  withRelayPairingEndpoint
} from './orcad-relay'

function inbox(ws: WebSocket): () => Promise<string> {
  const queued: string[] = []
  const waiting: { resolve: (text: string) => void; reject: (error: Error) => void }[] = []
  let closedWith: Error | null = null
  ws.on('message', (data) => {
    const text = String(data)
    const waiter = waiting.shift()
    if (waiter) {
      waiter.resolve(text)
    } else {
      queued.push(text)
    }
  })
  ws.on('close', (code, reason) => {
    closedWith = new Error(`socket closed ${code} ${String(reason)}`)
    for (const waiter of waiting.splice(0)) {
      waiter.reject(closedWith)
    }
  })
  return () =>
    new Promise((resolve, reject) => {
      const text = queued.shift()
      if (text !== undefined) {
        resolve(text)
      } else if (closedWith) {
        reject(closedWith)
      } else {
        waiting.push({ resolve, reject })
      }
    })
}

describe('orcad --relay', () => {
  const cleanups: (() => unknown)[] = []

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).toReversed()) {
      await cleanup()
    }
  })

  async function startServerAndRelay() {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orcad-relay-'))
    cleanups.push(() => rmSync(userDataPath, { recursive: true, force: true }))
    const relay = await FakeRelay.start({ key: 'relay-key' })
    cleanups.push(() => relay.close())
    const server = new OrcaRuntimeRpcServer({
      methods: STATUS_METHODS,
      runtime: new OrcaRuntimeService(),
      userDataPath,
      enableWebSocket: true,
      wsPort: 0,
      pinnedBindHost: '127.0.0.1'
    })
    await server.start()
    cleanups.push(() => server.stop())
    return { userDataPath, relay, server }
  }

  async function startOrcadWithRelay() {
    const { userDataPath, relay, server } = await startServerAndRelay()
    const orcadRelay = startOrcadRelay({ relayUrl: relay.url, userDataPath, rpc: server })
    cleanups.push(() => orcadRelay.stop())
    return { userDataPath, relay, server, clientUrl: orcadRelay.clientUrl }
  }

  /** Opens a pairing link the way the web client does: E2EE v2 through the relay, then the token. */
  async function connectPhone(pairingUrl: string) {
    const offer = parsePairingCode(pairingUrl)
    if (!offer) {
      throw new Error('pairing URL did not decode')
    }
    const peer = new SimulatedMobileE2EEV2Peer(
      nacl.box.keyPair(),
      new Uint8Array(Buffer.from(offer.publicKeyB64, 'base64')),
      null
    )
    const phone = new WebSocket(offer.endpoint)
    cleanups.push(() => phone.terminate())
    const next = inbox(phone)
    await new Promise((resolve) => phone.once('open', resolve))
    phone.send(JSON.stringify(peer.hello))
    expect(peer.acceptReady(JSON.parse(await next()))).toBe(true)
    const auth = { type: 'e2ee_auth', v: 2, transcriptHashB64: peer.transcriptHashB64 }
    phone.send(peer.sealText(JSON.stringify({ ...auth, deviceToken: offer.deviceToken })))
    expect(JSON.parse(peer.openText(await next()) ?? 'null')).toMatchObject({
      type: 'e2ee_authenticated'
    })
    return { phone, peer, next, offer }
  }

  it('pairs a browser through the relay and answers its RPC', async () => {
    const { userDataPath, relay, server, clientUrl } = await startOrcadWithRelay()
    const readiness = await buildServePairingReadiness(
      withRelayPairingEndpoint({}, clientUrl),
      server
    )

    const serverId = readOrCreateRelayServerId(userDataPath)
    expect(serverId).toMatch(/^srv_[A-Za-z0-9_-]{12}$/)
    if (process.platform !== 'win32') {
      const mode = statSync(join(userDataPath, ORCAD_RELAY_SERVER_ID_FILENAME)).mode & 0o777
      expect(mode).toBe(0o600)
    }
    const relayClientUrl = `${relay.url}&serverId=${serverId}&role=client&v=2`
    expect(readiness.advertisedEndpoint).toBe(relayClientUrl)
    if (!readiness.pairing.available) {
      throw new Error(`pairing unavailable: ${readiness.pairing.reason}`)
    }
    expect(readiness.pairing.scope).toBe('runtime')
    expect(readiness.pairing.webClientUrl).toBe(
      `${HOSTED_WEB_CLIENT_URL}#pairing=${encodeURIComponent(readiness.pairing.url)}`
    )
    expect(readiness.pairing.qr).not.toBeNull()
    const offer = parsePairingCode(readiness.pairing.url)
    if (!offer) {
      throw new Error('pairing URL did not decode')
    }
    expect(offer.endpoint).toBe(relayClientUrl)

    const { phone, peer, next } = await connectPhone(readiness.pairing.url)
    const request = { id: 'status-1', deviceToken: offer.deviceToken, method: 'status.get' }
    phone.send(peer.sealText(JSON.stringify(request)))
    expect(JSON.parse(peer.openText(await next()) ?? 'null')).toMatchObject({
      id: 'status-1',
      ok: true
    })
  })

  it('turns phone access on and off for a managing desktop and links a fresh pairing', async () => {
    const { userDataPath, relay, server } = await startServerAndRelay()
    const phoneRelay = new OrcadPhoneRelay({ userDataPath, rpc: server })
    cleanups.push(() => phoneRelay.stop())
    expect(phoneRelay.status()).toEqual({ relayHost: null })
    expect(() => phoneRelay.pair(undefined)).toThrow('Turn on phone access on this host first.')

    expect(phoneRelay.configure(relay.url)).toEqual({ relayHost: new URL(relay.url).host })
    expect(readConfiguredRelayUrl(userDataPath)).toBe(relay.url)
    if (process.platform !== 'win32') {
      const mode = statSync(join(userDataPath, ORCAD_RELAY_URL_FILENAME)).mode & 0o777
      expect(mode).toBe(0o600)
    }

    const webClientUrl = 'https://example.test/app/web-index.html'
    const first = phoneRelay.pair(webClientUrl)
    expect(first.webClientUrl).toBe(
      `${webClientUrl}#pairing=${encodeURIComponent(first.pairingUrl)}`
    )
    expect(parsePairingCode(first.pairingUrl)?.endpoint).toBe(phoneRelay.clientUrl)
    const second = phoneRelay.pair(webClientUrl)
    expect(parsePairingCode(second.pairingUrl)?.deviceToken).not.toBe(
      parsePairingCode(first.pairingUrl)?.deviceToken
    )

    expect(phoneRelay.configure(null)).toEqual({ relayHost: null })
    expect(readConfiguredRelayUrl(userDataPath)).toBeNull()
  })

  it('lists phones it paired, never the managing desktop, and revokes one with its live socket', async () => {
    const { userDataPath, relay, server } = await startServerAndRelay()
    const phoneRelay = new OrcadPhoneRelay({ userDataPath, rpc: server })
    cleanups.push(() => phoneRelay.stop())
    const desktop = server.createPairingOffer({ name: 'Desktop', scope: 'runtime' })
    if (!desktop.available) {
      throw new Error('desktop pairing unavailable')
    }
    phoneRelay.configure(relay.url)
    const { phone, offer } = await connectPhone(phoneRelay.pair(undefined).pairingUrl)
    const phoneId = offer.pairedDeviceId
    if (!phoneId) {
      throw new Error('phone offer names no device')
    }

    expect(phoneRelay.devices(desktop.deviceId).devices).toEqual([
      expect.objectContaining({ deviceId: phoneId, lastSeenAt: expect.any(Number) })
    ])
    expect(phoneRelay.devices(phoneId).devices).toEqual([])
    expect(phoneRelay.revoke(desktop.deviceId, undefined)).toEqual({ revoked: false })
    expect(phoneRelay.revoke(phoneId, phoneId)).toEqual({ revoked: false })

    const closed = new Promise((resolve) => phone.once('close', resolve))
    expect(phoneRelay.revoke(phoneId, desktop.deviceId)).toEqual({ revoked: true })
    await closed
    expect(phoneRelay.devices(desktop.deviceId).devices).toEqual([])
    expect(server.getDeviceRegistry()?.getDevice(desktop.deviceId)).not.toBeNull()
  })
})
