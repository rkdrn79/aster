/**
 * EXPERIMENT(relay): joins an Aster relay (protocol v2) in the server role, so clients reach this
 * host with no inbound port. A control socket announces relay clients; each one gets its own data
 * socket, which carries that client's frames unchanged in both directions. The client and this
 * host run E2EE end to end through it, so the relay never sees plaintext.
 */
import WebSocket, { type RawData } from 'ws'
import { relayServerUrl } from '../../../shared/relay-url'
import { WEBSOCKET_TRANSPORT_MAX_MESSAGE_BYTES } from './ws-transport'

const CONTROL_PING_INTERVAL_MS = 10_000
const CONTROL_STALE_MS = 30_000
// Why: a relay that accepts the socket but never announces clients is as useless as a closed one.
const CONTROL_FIRST_MESSAGE_TIMEOUT_MS = 8_000
const CONTROL_HANDSHAKE_TIMEOUT_MS = 10_000
const CONTROL_MAX_PAYLOAD_BYTES = 1024 * 1024
const DATA_HANDSHAKE_TIMEOUT_MS = 15_000
// Why below the transport's 128: anyone holding the relay key (a revoked phone keeps it) can
// announce clients, and they must not take every slot the managing desktop connects through.
const MAX_DATA_SOCKETS = 32
const RECONNECT_STEP_MS = 1_000
const RECONNECT_MAX_DELAY_MS = 30_000

type ControlMessage =
  | { type: 'sync'; connectionIds: string[] }
  | { type: 'connected' | 'disconnected'; connectionId: string }
  | { type: 'ping' }

type RelayListenerOptions = {
  relayUrl: string
  serverId: string
  /** Serves an open data socket as if it had been accepted locally. */
  acceptDataSocket: (ws: WebSocket) => void
  log: (message: string) => void
}

export class RelayListener {
  private control: WebSocket | null = null
  private readonly dataSockets = new Map<string, WebSocket>()
  private reconnectAttempt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = false

  constructor(private readonly options: RelayListenerOptions) {}

  start(): void {
    this.connectControl()
  }

  stop(): void {
    this.stopped = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.control?.terminate()
    this.control = null
    for (const ws of this.dataSockets.values()) {
      ws.terminate()
    }
    this.dataSockets.clear()
  }

  private connectControl(): void {
    if (this.stopped) {
      return
    }
    const { relayUrl, serverId } = this.options
    const socket = new WebSocket(relayServerUrl(relayUrl, serverId), {
      perMessageDeflate: false,
      maxPayload: CONTROL_MAX_PAYLOAD_BYTES,
      handshakeTimeout: CONTROL_HANDSHAKE_TIMEOUT_MS
    })
    this.control = socket
    let lastSeenAt = Date.now()
    let joined = false
    let firstMessageTimer: ReturnType<typeof setTimeout> | undefined
    let keepalive: ReturnType<typeof setInterval> | undefined

    socket.on('open', () => {
      lastSeenAt = Date.now()
      firstMessageTimer = setTimeout(() => socket.terminate(), CONTROL_FIRST_MESSAGE_TIMEOUT_MS)
      // Why protocol pings: a half-open control socket may never emit close on its own.
      keepalive = setInterval(() => {
        if (Date.now() - lastSeenAt > CONTROL_STALE_MS) {
          socket.terminate()
          return
        }
        socket.ping()
      }, CONTROL_PING_INTERVAL_MS)
      keepalive.unref?.()
    })
    socket.on('pong', () => {
      lastSeenAt = Date.now()
    })
    socket.on('message', (data, isBinary) => {
      lastSeenAt = Date.now()
      const message = isBinary ? null : parseControlMessage(data)
      if (!message) {
        return
      }
      if (!joined) {
        joined = true
        // Why reset here and not on open: a relay that accepts then drops must keep backing off.
        this.reconnectAttempt = 0
        clearTimeout(firstMessageTimer)
        this.options.log(`joined ${new URL(relayUrl).host}`)
      }
      this.handleControlMessage(socket, message)
    })
    socket.on('error', (error) => this.options.log(`control socket error: ${error.message}`))
    socket.on('close', (code) => {
      clearTimeout(firstMessageTimer)
      clearInterval(keepalive)
      if (this.control !== socket) {
        return
      }
      this.control = null
      this.scheduleReconnect(code)
    })
  }

  private scheduleReconnect(code: number): void {
    if (this.stopped || this.reconnectTimer) {
      return
    }
    this.reconnectAttempt += 1
    const delayMs = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_STEP_MS * this.reconnectAttempt)
    this.options.log(`control socket closed (${code}); reconnecting in ${delayMs} ms`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connectControl()
    }, delayMs)
    this.reconnectTimer.unref?.()
  }

  private handleControlMessage(control: WebSocket, message: ControlMessage): void {
    if (message.type === 'sync') {
      const live = new Set(message.connectionIds)
      for (const connectionId of this.dataSockets.keys()) {
        if (!live.has(connectionId)) {
          this.closeDataSocket(connectionId)
        }
      }
      this.openDataSockets([...live])
    } else if (message.type === 'connected') {
      this.openDataSockets([message.connectionId])
    } else if (message.type === 'disconnected') {
      this.closeDataSocket(message.connectionId)
    } else {
      control.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
    }
  }

  private openDataSockets(connectionIds: readonly string[]): void {
    const fresh = connectionIds.filter((connectionId) => !this.dataSockets.has(connectionId))
    const room = Math.max(0, MAX_DATA_SOCKETS - this.dataSockets.size)
    for (const connectionId of fresh.slice(0, room)) {
      this.openDataSocket(connectionId)
    }
    if (fresh.length > room) {
      this.options.log(
        `ignored ${fresh.length - room} relay clients; ${MAX_DATA_SOCKETS} is the most`
      )
    }
  }

  private openDataSocket(connectionId: string): void {
    if (this.stopped) {
      return
    }
    const { relayUrl, serverId } = this.options
    const ws = new WebSocket(relayServerUrl(relayUrl, serverId, connectionId), {
      perMessageDeflate: false,
      maxPayload: WEBSOCKET_TRANSPORT_MAX_MESSAGE_BYTES,
      handshakeTimeout: DATA_HANDSHAKE_TIMEOUT_MS
    })
    this.dataSockets.set(connectionId, ws)
    ws.on('error', (error) => this.options.log(`data socket error: ${error.message}`))
    // Why on open: the relay delivers frames the client sent earlier only once this socket joins.
    ws.once('open', () => this.options.acceptDataSocket(ws))
    ws.once('close', () => {
      if (this.dataSockets.get(connectionId) === ws) {
        this.dataSockets.delete(connectionId)
      }
    })
  }

  private closeDataSocket(connectionId: string): void {
    const ws = this.dataSockets.get(connectionId)
    if (!ws) {
      return
    }
    this.dataSockets.delete(connectionId)
    ws.close(1001, 'Client disconnected')
  }
}

function parseControlMessage(data: RawData): ControlMessage | null {
  if (!Buffer.isBuffer(data)) {
    return null
  }
  let value: unknown
  try {
    value = JSON.parse(data.toString('utf8'))
  } catch {
    return null
  }
  if (!isRecord(value)) {
    return null
  }
  const { type, connectionId, connectionIds } = value
  if (type === 'ping') {
    return { type }
  }
  if (type === 'sync' && Array.isArray(connectionIds)) {
    return { type, connectionIds: connectionIds.filter(isConnectionId) }
  }
  if ((type === 'connected' || type === 'disconnected') && isConnectionId(connectionId)) {
    return { type, connectionId }
  }
  return null
}

function isConnectionId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
