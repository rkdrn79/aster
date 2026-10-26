import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import { resolveOrcadWebClientRoot } from './orcad-command-arguments'
import type { OrcadRuntimeCleanup } from './orcad-runtime-lifetime'
import type { OrcadOptions } from './orcad-start-contract'
import { orcadWsPortOptions } from './orcad-ws-port-policy'

/**
 * Serves runtime RPC on orcad's pinned listener and, with `--relay`, through that relay too.
 * Returns the options the pairing offer should read.
 */
export async function startOrcadRpcServer(input: {
  runtime: OrcaRuntimeService
  options: OrcadOptions
  bindHost: string
  userDataPath: string
  registerCleanup: (cleanup: OrcadRuntimeCleanup) => void
}): Promise<{ rpc: OrcaRuntimeRpcServer; pairingOptions: OrcadOptions }> {
  const { options, registerCleanup } = input
  const rpc = new OrcaRuntimeRpcServer({
    runtime: input.runtime,
    userDataPath: input.userDataPath,
    enableWebSocket: true,
    // Why pinned and not `exposeNetworkByDefault`: an unattended host's exposure must be
    // exactly what the operator asked for, on every launch. The default path widens itself
    // once a device has connected, so a loopback deployment would silently go wide one
    // restart after its first client paired.
    pinnedBindHost: input.bindHost,
    webClientRoot: resolveOrcadWebClientRoot(options.webClientRoot),
    ...orcadWsPortOptions(options.port)
  })
  // Stops first: no RPC may write while the rest of the runtime is torn down.
  registerCleanup(() => rpc.stop())
  await rpc.start()
  if (!options.relay) {
    return { rpc, pairingOptions: options }
  }
  const { startOrcadPaseoRelay, withRelayPairingEndpoint } = await import('./orcad-paseo-relay')
  const relay = startOrcadPaseoRelay({
    relayUrl: options.relay,
    userDataPath: input.userDataPath,
    rpc
  })
  // Registered after the RPC stop so it runs first: no relay client is redialed mid-shutdown.
  registerCleanup(() => relay.stop())
  return { rpc, pairingOptions: withRelayPairingEndpoint(options, relay.clientUrl) }
}
