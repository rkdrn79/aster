import type { AddressInfo } from 'node:net'
import WebSocket, { WebSocketServer, type RawData } from 'ws'
import { relayClientUrl } from '../../../shared/relay-url'

type Frame = { data: RawData; isBinary: boolean }

/**
 * An in-process Aster relay (protocol v2) for one serverId: a control socket, relay-assigned client
 * connection ids, buffering until the server's data socket joins, and the optional `key` query check.
 */
export class FakeRelay {
  readonly clients = new Map<string, WebSocket>()
  readonly dataSockets = new Map<string, WebSocket>()
  control: WebSocket | null = null
  controlJoins = 0
  private readonly pending = new Map<string, Frame[]>()
  private nextConnection = 0

  private constructor(
    private readonly wss: WebSocketServer,
    private readonly key: string | null
  ) {
    wss.on('connection', (ws, request) => {
      const params = new URL(request.url ?? '/', 'ws://relay').searchParams
      const connectionId = params.get('connectionId')
      if (params.get('role') === 'client') {
        this.acceptClient(ws)
      } else if (connectionId) {
        this.acceptData(ws, connectionId)
      } else {
        this.acceptControl(ws)
      }
    })
  }

  static async start(options: { key?: string } = {}): Promise<FakeRelay> {
    const key = options.key ?? null
    const wss = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
      verifyClient: ({ req }) =>
        key === null || new URL(req.url ?? '/', 'ws://relay').searchParams.get('key') === key
    })
    await new Promise<void>((resolve) => wss.once('listening', resolve))
    return new FakeRelay(wss, key)
  }

  get url(): string {
    const address: AddressInfo | string | null = this.wss.address()
    if (!address || typeof address === 'string') {
      throw new Error('relay is not listening')
    }
    const url = new URL(`ws://127.0.0.1:${address.port}/ws`)
    if (this.key !== null) {
      url.searchParams.set('key', this.key)
    }
    return url.toString()
  }

  connectClient(serverId: string): WebSocket {
    return new WebSocket(relayClientUrl(this.url, serverId))
  }

  async close(): Promise<void> {
    for (const ws of this.wss.clients) {
      ws.terminate()
    }
    await new Promise<void>((resolve) => this.wss.close(() => resolve()))
  }

  private acceptControl(ws: WebSocket): void {
    this.control?.close(1008, 'Replaced by new connection')
    this.control = ws
    this.controlJoins += 1
    ws.send(JSON.stringify({ type: 'sync', connectionIds: [...this.clients.keys()] }))
    ws.on('close', () => {
      if (this.control === ws) {
        this.control = null
      }
    })
  }

  private acceptClient(ws: WebSocket): void {
    const connectionId = `conn-${(this.nextConnection += 1)}`
    this.clients.set(connectionId, ws)
    this.pending.set(connectionId, [])
    ws.on('message', (data, isBinary) => {
      const server = this.dataSockets.get(connectionId)
      if (server) {
        server.send(data, { binary: isBinary })
      } else {
        this.pending.get(connectionId)?.push({ data, isBinary })
      }
    })
    ws.on('close', () => {
      this.clients.delete(connectionId)
      this.pending.delete(connectionId)
      this.dataSockets.get(connectionId)?.close(1001, 'Client disconnected')
      this.control?.send(JSON.stringify({ type: 'disconnected', connectionId }))
    })
    this.control?.send(JSON.stringify({ type: 'connected', connectionId }))
  }

  private acceptData(ws: WebSocket, connectionId: string): void {
    this.dataSockets.set(connectionId, ws)
    for (const frame of this.pending.get(connectionId)?.splice(0) ?? []) {
      ws.send(frame.data, { binary: frame.isBinary })
    }
    ws.on('message', (data, isBinary) => {
      this.clients.get(connectionId)?.send(data, { binary: isBinary })
    })
    ws.on('close', () => {
      if (this.dataSockets.get(connectionId) === ws) {
        this.dataSockets.delete(connectionId)
      }
      this.clients.get(connectionId)?.close(1012, 'Server disconnected')
    })
  }
}
