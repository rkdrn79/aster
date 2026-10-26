import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket, { type RawData } from 'ws'
import { FakePaseoRelay } from './fake-paseo-relay.test-fixture'
import { PaseoRelayListener } from './paseo-relay-listener'
import { WebSocketTransport } from './ws-transport'

const SERVER_ID = 'srv_testServerId'

function opened(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })
}

function nextMessage(ws: WebSocket): Promise<{ data: Buffer; isBinary: boolean }> {
  return new Promise((resolve) => {
    ws.once('message', (data, isBinary) => resolve({ data: toBuffer(data), isBinary }))
  })
}

function toBuffer(data: RawData): Buffer {
  return Buffer.isBuffer(data)
    ? data
    : Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.from(data)
}

describe('PaseoRelayListener', () => {
  const cleanups: (() => unknown)[] = []

  afterEach(async () => {
    vi.useRealTimers()
    for (const cleanup of cleanups.splice(0).toReversed()) {
      await cleanup()
    }
  })

  async function startRelay(): Promise<FakePaseoRelay> {
    const relay = await FakePaseoRelay.start()
    cleanups.push(() => relay.close())
    return relay
  }

  function startListener(
    relay: FakePaseoRelay,
    acceptDataSocket: ConstructorParameters<typeof PaseoRelayListener>[0]['acceptDataSocket'],
    log: (message: string) => void = () => {}
  ): PaseoRelayListener {
    const listener = new PaseoRelayListener({
      relayUrl: relay.url,
      serverId: SERVER_ID,
      acceptDataSocket,
      log
    })
    listener.start()
    cleanups.push(() => listener.stop())
    return listener
  }

  function connectClient(relay: FakePaseoRelay): WebSocket {
    const client = relay.connectClient(SERVER_ID)
    cleanups.push(() => client.terminate())
    return client
  }

  it('serves clients announced by sync and connected, and lets go of one that leaves', async () => {
    const relay = await startRelay()
    const early = connectClient(relay)
    await opened(early)
    const accepted: WebSocket[] = []
    startListener(relay, (ws) => accepted.push(ws))

    await vi.waitFor(() => expect(accepted).toHaveLength(1))
    expect([...relay.dataSockets.keys()]).toEqual(['conn-1'])

    const late = connectClient(relay)
    await vi.waitFor(() => expect(accepted).toHaveLength(2))
    expect([...relay.dataSockets.keys()].sort()).toEqual(['conn-1', 'conn-2'])

    late.close()
    await vi.waitFor(() => expect(accepted[1]!.readyState).toBe(WebSocket.CLOSED))
    expect(accepted[0]!.readyState).toBe(WebSocket.OPEN)
  })

  it('passes text and binary frames through unchanged, stripping only the hello key', async () => {
    const relay = await startRelay()
    const transport = new WebSocketTransport({ host: '127.0.0.1', port: 0 })
    cleanups.push(() => transport.stop())
    const received: (string | Uint8Array)[] = []
    transport.onMessage((message, reply, ws) => {
      received.push(message)
      if (typeof message === 'string') {
        reply(`echo ${message}`)
      } else {
        ws.send(Uint8Array.from(message).toReversed())
      }
    })
    await transport.start()
    startListener(relay, (ws, options) => transport.adoptConnection(ws, options))
    const client = connectClient(relay)
    await opened(client)

    const hello = { type: 'e2ee_hello', v: 2, clientPublicKeyB64: 'pk' }
    client.send(JSON.stringify({ ...hello, key: 'pk' }))
    const helloEcho = await nextMessage(client)
    expect(JSON.parse(String(received[0]))).toEqual(hello)
    expect(helloEcho).toEqual({
      data: Buffer.from(`echo ${JSON.stringify(hello)}`),
      isBinary: false
    })

    const laterHello = JSON.stringify({ ...hello, key: 'pk' })
    client.send(laterHello)
    expect(await nextMessage(client)).toEqual({
      data: Buffer.from(`echo ${laterHello}`),
      isBinary: false
    })

    client.send(Uint8Array.of(1, 2, 3), { binary: true })
    expect(await nextMessage(client)).toEqual({ data: Buffer.from([3, 2, 1]), isBinary: true })
    expect(received[2]).toEqual(Uint8Array.of(1, 2, 3))
  })

  it('rejoins after the control socket closes and serves a client that came meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const relay = await startRelay()
    const accepted: WebSocket[] = []
    const logs: string[] = []
    startListener(
      relay,
      (ws) => accepted.push(ws),
      (message) => logs.push(message)
    )
    await vi.waitFor(() => expect(logs).toContain(`joined ${new URL(relay.url).host}`))

    relay.control?.close(1012, 'Relay restarting')
    await vi.waitFor(() =>
      expect(logs).toContain('control socket closed (1012); reconnecting in 1000 ms')
    )
    const client = connectClient(relay)
    await opened(client)
    expect(accepted).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1_000)
    await vi.waitFor(() => expect(accepted).toHaveLength(1))
    expect(relay.controlJoins).toBe(2)
  })
})
