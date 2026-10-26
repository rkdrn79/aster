// EXPERIMENT(paseo-relay): socket URLs on a Paseo protocol v2 relay, such as wss://relay.paseo.sh/ws.
// Any relay speaking that protocol works, so an Aster-owned relay can reuse them.

/** The relay URL normalized, or null unless it is ws(s) without credentials or a fragment. */
export function parsePaseoRelayUrl(value: string): string | null {
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
export function paseoRelayServerUrl(
  relayUrl: string,
  serverId: string,
  connectionId?: string
): string {
  return withRelayParams(relayUrl, {
    serverId,
    role: 'server',
    v: '2',
    ...(connectionId ? { connectionId } : {})
  })
}

/** What a phone dials; the relay assigns its connection id. */
export function paseoRelayClientUrl(relayUrl: string, serverId: string): string {
  return withRelayParams(relayUrl, { serverId, role: 'client', v: '2' })
}

function withRelayParams(relayUrl: string, params: Record<string, string>): string {
  const url = new URL(relayUrl)
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value)
  }
  return url.toString()
}
