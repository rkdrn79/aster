import '../runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nacl from 'tweetnacl'
import WebSocket from 'ws'
import { afterEach, describe, expect, it } from 'vitest'
import { parsePairingCode } from '../../shared/pairing'
import { SimulatedMobileE2EEV2Peer } from '../runtime/mobile-cloud-relay/simulated-mobile-e2ee-v2-peer'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import { FakePaseoRelay } from '../runtime/rpc/fake-paseo-relay.test-fixture'
import { STATUS_METHODS } from '../runtime/rpc/methods/status'
import { buildServePairingReadiness } from '../server/serve-pairing-readiness'
import {
  ORCAD_RELAY_SERVER_ID_FILENAME,
  readOrCreateRelayServerId,
  startOrcadPaseoRelay,
  withRelayPairingEndpoint
} from './orcad-paseo-relay'

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

  async function startOrcadWithRelay() {
    const userDataPath = mkdtempSync(join(tmpdir(), 'orcad-relay-'))
    cleanups.push(() => rmSync(userDataPath, { recursive: true, force: true }))
    const relay = await FakePaseoRelay.start()
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
    const orcadRelay = startOrcadPaseoRelay({ relayUrl: relay.url, userDataPath, rpc: server })
    cleanups.push(() => orcadRelay.stop())
    return { userDataPath, relay, server, clientUrl: orcadRelay.clientUrl }
  }

  it('pairs a phone through the relay and answers its RPC', async () => {
    const { userDataPath, relay, server, clientUrl } = await startOrcadWithRelay()
    const readiness = await buildServePairingReadiness(
      withRelayPairingEndpoint({ mobilePairing: true }, clientUrl),
      server
    )

    const serverId = readOrCreateRelayServerId(userDataPath)
    expect(serverId).toMatch(/^srv_[A-Za-z0-9_-]{12}$/)
    if (process.platform !== 'win32') {
      const mode = statSync(join(userDataPath, ORCAD_RELAY_SERVER_ID_FILENAME)).mode & 0o777
      expect(mode).toBe(0o600)
    }
    const relayClientUrl = `${relay.url}?serverId=${serverId}&role=client&v=2`
    expect(readiness.advertisedEndpoint).toBe(relayClientUrl)
    if (!readiness.pairing.available) {
      throw new Error(`pairing unavailable: ${readiness.pairing.reason}`)
    }
    expect(readiness.pairing.scope).toBe('mobile')
    const offer = parsePairingCode(readiness.pairing.url)
    if (!offer) {
      throw new Error('pairing URL did not decode')
    }
    expect(offer.endpoint).toBe(relayClientUrl)

    const peer = new SimulatedMobileE2EEV2Peer(
      nacl.box.keyPair(),
      new Uint8Array(Buffer.from(offer.publicKeyB64, 'base64')),
      null
    )
    const phone = new WebSocket(offer.endpoint)
    cleanups.push(() => phone.terminate())
    const next = inbox(phone)
    await new Promise((resolve) => phone.once('open', resolve))
    // What the phone sends on a Paseo relay: the fake relay refuses a hello without `key`.
    phone.send(JSON.stringify({ ...peer.hello, key: peer.hello.clientPublicKeyB64 }))
    expect(peer.acceptReady(JSON.parse(await next()))).toBe(true)

    const auth = { type: 'e2ee_auth', v: 2, transcriptHashB64: peer.transcriptHashB64 }
    phone.send(peer.sealText(JSON.stringify({ ...auth, deviceToken: offer.deviceToken })))
    expect(JSON.parse(peer.openText(await next()) ?? 'null')).toMatchObject({
      type: 'e2ee_authenticated'
    })

    const request = { id: 'status-1', deviceToken: offer.deviceToken, method: 'status.get' }
    phone.send(peer.sealText(JSON.stringify(request)))
    expect(JSON.parse(peer.openText(await next()) ?? 'null')).toMatchObject({
      id: 'status-1',
      ok: true
    })
  })

  it('still refuses a direct hello that carries the relay key', async () => {
    const { server } = await startOrcadWithRelay()
    const endpoint = server.getWebSocketEndpoint()
    if (!endpoint) {
      throw new Error('no WebSocket endpoint')
    }
    const peer = new SimulatedMobileE2EEV2Peer(
      nacl.box.keyPair(),
      new Uint8Array(Buffer.from(server.getE2EEPublicKey() ?? '', 'base64')),
      null
    )
    const direct = new WebSocket(endpoint)
    cleanups.push(() => direct.terminate())
    await new Promise((resolve) => direct.once('open', resolve))
    const closed = new Promise<number>((resolve) => direct.once('close', resolve))
    direct.send(JSON.stringify({ ...peer.hello, key: peer.hello.clientPublicKeyB64 }))
    expect(await closed).toBe(4001)
  })
})
