// EXPERIMENT(paseo-relay): `orcad --relay <url>` serves clients through a Paseo protocol v2 relay.
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { paseoRelayClientUrl } from '../../shared/paseo-relay-url'
import { isUnreadableError, writeSecureFile } from '../../shared/secure-file'
import { PaseoRelayListener } from '../runtime/rpc/paseo-relay-listener'
import type { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import type { OrcadOptions } from './orcad-start-contract'

export const ORCAD_RELAY_SERVER_ID_FILENAME = 'paseo-relay-server-id'
const SERVER_ID_PATTERN = /^srv_[A-Za-z0-9_-]{12}$/

/**
 * Why stored: a phone's pairing endpoint names this id, so a restart must rejoin the same relay
 * slot. Knowing it lets someone take over the slot (the relay checks no ownership), not read traffic.
 */
export function readOrCreateRelayServerId(userDataPath: string): string {
  const filePath = join(userDataPath, ORCAD_RELAY_SERVER_ID_FILENAME)
  try {
    const stored = readFileSync(filePath, 'utf8').trim()
    if (SERVER_ID_PATTERN.test(stored)) {
      return stored
    }
  } catch (error) {
    // Why: minting over a file we merely cannot read would strand every phone paired through it.
    if (isUnreadableError(error)) {
      throw error
    }
  }
  const minted = `srv_${randomBytes(9).toString('base64url')}`
  writeSecureFile(filePath, `${minted}\n`)
  return minted
}

export function startOrcadPaseoRelay(input: {
  relayUrl: string
  userDataPath: string
  rpc: Pick<OrcaRuntimeRpcServer, 'adoptRelayWebSocket'>
}): { clientUrl: string; stop: () => void } {
  const serverId = readOrCreateRelayServerId(input.userDataPath)
  const listener = new PaseoRelayListener({
    relayUrl: input.relayUrl,
    serverId,
    acceptDataSocket: (ws, options) => {
      input.rpc.adoptRelayWebSocket(ws, options)
    },
    log: (message) => console.error(`[orcad] relay: ${message}`)
  })
  listener.start()
  return {
    clientUrl: paseoRelayClientUrl(input.relayUrl, serverId),
    stop: () => listener.stop()
  }
}

/**
 * Why mobile offers only: the phone adds the hosted relay's handshake `key`; runtime clients do
 * not, so their offer keeps the direct endpoint.
 */
export function withRelayPairingEndpoint(options: OrcadOptions, clientUrl: string): OrcadOptions {
  return options.mobilePairing ? { ...options, pairingAddress: clientUrl } : options
}
