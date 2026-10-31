// EXPERIMENT(relay): orcad serves clients through an Aster relay (protocol v2), from `--relay <url>`
// or the URL a managing desktop set with phoneRelay.configure.
import { randomBytes } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { parseRelayUrl, relayClientUrl } from '../../shared/relay-url'
import {
  HOSTED_WEB_CLIENT_URL,
  parseWebClientUrl,
  withPairingFragment
} from '../../shared/hosted-web-client'
import type {
  PhoneRelayDevices,
  PhoneRelayPairing,
  PhoneRelayRevokeResult,
  PhoneRelayStatus
} from '../../shared/phone-relay-contract'
import { isUnreadableError, writeSecureFile } from '../../shared/secure-file'
import { RelayListener } from '../runtime/rpc/relay-listener'
import type { PhoneRelayControl } from '../runtime/phone-relay-control'
import {
  listPhoneAccessPairings,
  phoneAccessDeviceName,
  toPhoneRelayDevice,
  type PhoneAccessPairing
} from '../runtime/phone-access-devices'
import type { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import type { OrcadOptions } from './orcad-start-contract'

export const ORCAD_RELAY_SERVER_ID_FILENAME = 'relay-server-id'
/** Why a file: the relay URL carries its key, and a restarted orcad must rejoin without the desktop. */
export const ORCAD_RELAY_URL_FILENAME = 'relay-url'
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

export function startOrcadRelay(input: {
  relayUrl: string
  userDataPath: string
  rpc: Pick<OrcaRuntimeRpcServer, 'adoptRelayWebSocket'>
}): { clientUrl: string; stop: () => void } {
  const serverId = readOrCreateRelayServerId(input.userDataPath)
  const listener = new RelayListener({
    relayUrl: input.relayUrl,
    serverId,
    acceptDataSocket: (ws) => {
      input.rpc.adoptRelayWebSocket(ws)
    },
    log: (message) => console.error(`[orcad] relay: ${message}`)
  })
  listener.start()
  return {
    clientUrl: relayClientUrl(input.relayUrl, serverId),
    stop: () => listener.stop()
  }
}

/** Every offer names the relay: a host behind it has no endpoint a phone could dial directly. */
export function withRelayPairingEndpoint(options: OrcadOptions, clientUrl: string): OrcadOptions {
  return {
    ...options,
    pairingAddress: clientUrl,
    webClientUrl: options.webClientUrl ?? HOSTED_WEB_CLIENT_URL
  }
}

/** The relay URL a desktop configured on this host, or null when phone access is off. */
export function readConfiguredRelayUrl(userDataPath: string): string | null {
  try {
    return parseRelayUrl(readFileSync(join(userDataPath, ORCAD_RELAY_URL_FILENAME), 'utf8').trim())
  } catch {
    return null
  }
}

type RelayRpc = Pick<
  OrcaRuntimeRpcServer,
  'adoptRelayWebSocket' | 'createPairingOffer' | 'getDeviceRegistry' | 'revokeRuntimeAccess'
>

export class OrcadPhoneRelay implements PhoneRelayControl {
  private active: { relayUrl: string; clientUrl: string; stop: () => void } | null = null

  constructor(private readonly input: { userDataPath: string; rpc: RelayRpc }) {}

  /** What a phone dials while phone access is on. */
  get clientUrl(): string | null {
    return this.active?.clientUrl ?? null
  }

  start(relayUrl: string): void {
    this.stop()
    const relay = startOrcadRelay({ relayUrl, ...this.input })
    this.active = { relayUrl, ...relay }
  }

  stop(): void {
    this.active?.stop()
    this.active = null
  }

  status(): PhoneRelayStatus {
    return { relayHost: this.active ? new URL(this.active.relayUrl).host : null }
  }

  configure(relayUrl: string | null): PhoneRelayStatus {
    const filePath = join(this.input.userDataPath, ORCAD_RELAY_URL_FILENAME)
    if (relayUrl === null) {
      rmSync(filePath, { force: true })
      this.stop()
      return this.status()
    }
    const parsed = parseRelayUrl(relayUrl)
    if (!parsed) {
      throw new Error('Expected a ws:// or wss:// relay URL.')
    }
    writeSecureFile(filePath, `${parsed}\n`)
    this.start(parsed)
    return this.status()
  }

  pair(webClientUrl: string | undefined): PhoneRelayPairing {
    if (!this.active) {
      throw new Error('Turn on phone access on this host first.')
    }
    const base = parseWebClientUrl(webClientUrl ?? HOSTED_WEB_CLIENT_URL)
    if (!base) {
      throw new Error('Expected an http:// or https:// web client URL without a fragment.')
    }
    // Why rotate: each QR mints a fresh token, so an earlier unscanned one stops working.
    const offer = this.input.rpc.createPairingOffer({
      address: this.active.clientUrl,
      name: phoneAccessDeviceName(new Date()),
      scope: 'runtime',
      rotate: true,
      origin: 'phone-access'
    })
    if (!offer.available) {
      throw new Error(offer.guidance)
    }
    return {
      pairingUrl: offer.pairingUrl,
      webClientUrl: withPairingFragment(base, offer.pairingUrl)
    }
  }

  // Why no relay check: a phone paired earlier keeps its credential while phone access is off.
  devices(callerDeviceId: string | undefined): PhoneRelayDevices {
    return { devices: this.pairings(callerDeviceId).map(toPhoneRelayDevice) }
  }

  revoke(deviceId: string, callerDeviceId: string | undefined): PhoneRelayRevokeResult {
    const pairing = this.pairings(callerDeviceId).find(
      (candidate) => candidate.link.deviceId === deviceId
    )
    if (!pairing) {
      return { revoked: false }
    }
    // Why installations first: the link stays listed until every key is gone, so a retry finds the rest.
    for (const device of [...pairing.installations, pairing.link]) {
      if (!this.input.rpc.revokeRuntimeAccess(device.deviceId)) {
        return { revoked: false }
      }
    }
    return { revoked: true }
  }

  private pairings(callerDeviceId: string | undefined): PhoneAccessPairing[] {
    const registry = this.input.rpc.getDeviceRegistry()
    // Why throw: an empty list would read as "no phones" while paired ones keep working.
    if (!registry) {
      throw new Error('This server cannot read its paired devices right now.')
    }
    return listPhoneAccessPairings(registry.listDevices(), callerDeviceId)
  }
}
