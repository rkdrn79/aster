import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket, { type RawData } from 'ws'
import { FakeRelay } from './fake-relay.test-fixture'
import { RelayListener } from './relay-listener'
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

describe('RelayListener', () => {
  const cleanups: (() => unknown)[] = []

  afterEach(async () => {
    vi.useRealTimers()
    for (const cleanup of cleanups.splice(0).toReversed()) {
      await cleanup()
    }
  })

  async function startRelay(): Promise<FakeRelay> {
    // Why keyed: a server or data socket URL that drops the relay's `key` is refused.
    const relay = await FakeRelay.start({ key: 'relay-key' })
    cleanups.push(() => relay.close())
    return relay
  }

  function startListener(
    relay: FakeRelay,
    acceptDataSocket: ConstructorParameters<typeof RelayListener>[0]['acceptDataSocket'],
    log: (message: string) => void = () => {}
  ): RelayListener {
    const listener = new RelayListener({
      relayUrl: relay.url,
      serverId: SERVER_ID,
      acceptDataSocket,
      log
    })
    listener.start()
    cleanups.push(() => listener.stop())
    return listener
  }

  function connectClient(relay: FakeRelay): WebSocket {
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

  it('passes text and binary frames through unchanged', async () => {
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
    startListener(relay, (ws) => transport.adoptConnection(ws))
    const client = connectClient(relay)
    await opened(client)

    const hello = JSON.stringify({ type: 'e2ee_hello', v: 2, clientPublicKeyB64: 'pk' })
    client.send(hello)
    expect(await nextMessage(client)).toEqual({
      data: Buffer.from(`echo ${hello}`),
      isBinary: false
    })
    expect(received[0]).toBe(hello)

    client.send(Uint8Array.of(1, 2, 3), { binary: true })
    expect(await nextMessage(client)).toEqual({ data: Buffer.from([3, 2, 1]), isBinary: true })
    expect(received[1]).toEqual(Uint8Array.of(1, 2, 3))
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

  it('serves at most 32 relay clients, so a flood of them leaves the host room', async () => {
    const relay = await startRelay()
    const accepted: WebSocket[] = []
    const logs: string[] = []
    startListener(
      relay,
      (ws) => accepted.push(ws),
      (message) => logs.push(message)
    )
    await vi.waitFor(() => expect(relay.control).not.toBeNull())
    const flood = Array.from({ length: 40 }, (_, index) => `flood-${index}`)
    relay.control?.send(JSON.stringify({ type: 'sync', connectionIds: flood }))
    await vi.waitFor(() => expect(accepted).toHaveLength(32))
    expect(logs).toContain('ignored 8 relay clients; 32 is the most')

    // A client that leaves frees its slot for the next one.
    relay.control?.send(JSON.stringify({ type: 'disconnected', connectionId: 'flood-0' }))
    await vi.waitFor(() => expect(relay.dataSockets.has('flood-0')).toBe(false))
    relay.control?.send(JSON.stringify({ type: 'connected', connectionId: 'late' }))
    await vi.waitFor(() => expect(relay.dataSockets.has('late')).toBe(true))
  })
})
