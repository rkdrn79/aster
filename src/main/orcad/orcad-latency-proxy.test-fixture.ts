// Test fixture: a TCP proxy in front of a local orcad that behaves like an SSH tunnel to a far host.
// Every chunk is delayed by `oneWayMs`; server-to-client bytes share one FIFO link of `bytesPerSec`,
// as every channel of one SSH connection does; and one connection's reply can be cut after its
// request went through, as a link dropping mid-send does.
import { connect, createServer, type Server, type Socket } from 'node:net'

export type LatencyProxy = {
  port: number
  close: () => void
  /** Client chunks the last closed connection wrote: its handshake, its request, its close. */
  lastClientChunks: () => number
  /** The next connection forwards its first `chunks` client chunks, then gets nothing back and
   *  drops: its request reaches the host, its reply never reaches the client. */
  cutNextReplyAfter: (chunks: number) => void
}

export function startLatencyProxy(
  targetPort: number,
  oneWayMs: number,
  bytesPerSec: number
): Promise<LatencyProxy> {
  let lastChunks = 0
  let cutAfter: number | null = null
  let linkFreeAt = 0
  const server: Server = createServer((client: Socket) => {
    const upstream = connect(targetPort, '127.0.0.1')
    const cut = cutAfter
    cutAfter = null
    let clientChunks = 0
    let replyCut = false
    client.on('data', (chunk) => {
      clientChunks += 1
      if (cut !== null && clientChunks >= cut) {
        replyCut = true
        setTimeout(() => client.destroy(), oneWayMs * 4)
      }
      setTimeout(() => upstream.writable && upstream.write(chunk), oneWayMs)
    })
    upstream.on('data', (chunk) => {
      if (replyCut) {
        return
      }
      const now = Date.now()
      linkFreeAt = Math.max(linkFreeAt, now) + (chunk.length / bytesPerSec) * 1_000
      setTimeout(() => client.writable && client.write(chunk), linkFreeAt - now + oneWayMs)
    })
    client.on('close', () => {
      lastChunks = clientChunks
      setTimeout(() => upstream.destroy(), oneWayMs)
    })
    upstream.on('close', () => setTimeout(() => client.destroy(), oneWayMs))
    client.on('error', () => upstream.destroy())
    upstream.on('error', () => client.destroy())
  })
  return new Promise((resolveListen) =>
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      resolveListen({
        port: typeof address === 'object' && address ? address.port : 0,
        close: () => server.close(),
        lastClientChunks: () => lastChunks,
        cutNextReplyAfter: (chunks) => {
          cutAfter = chunks
        }
      })
    })
  )
}
