// EXPERIMENT(relay): socket URLs on an Aster relay (protocol v2), such as
// wss://aster-relay.<subdomain>.workers.dev/ws?key=<key>. Query params the relay URL carries, like
// its `key`, stay on every socket URL built from it.

/** The relay URL normalized, or null unless it is ws(s) without credentials or a fragment. */
export function parseRelayUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'ws:' && url.protocol !== 'wss:') ||
      url.username ||
      url.password ||
      url.hash
    ) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

/** The control socket without a connection id, else that relay client's data socket. */
export function relayServerUrl(relayUrl: string, serverId: string, connectionId?: string): string {
  return withRelayParams(relayUrl, {
    serverId,
    role: 'server',
    v: '2',
    ...(connectionId ? { connectionId } : {})
  })
}

/** What a phone dials; the relay assigns its connection id. */
export function relayClientUrl(relayUrl: string, serverId: string): string {
  return withRelayParams(relayUrl, { serverId, role: 'client', v: '2' })
}

function withRelayParams(relayUrl: string, params: Record<string, string>): string {
  const url = new URL(relayUrl)
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value)
  }
  return url.toString()
}
