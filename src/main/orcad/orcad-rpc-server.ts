import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import { resolveOrcadWebClientRoot } from './orcad-command-arguments'
import type { OrcadRuntimeCleanup } from './orcad-runtime-lifetime'
import type { OrcadOptions } from './orcad-start-contract'
import { orcadWsPortOptions } from './orcad-ws-port-policy'
import { OrcadPhoneRelay, readConfiguredRelayUrl, withRelayPairingEndpoint } from './orcad-relay'
import { setPhoneRelayControl } from '../runtime/phone-relay-control'
import { startOrcadPhoneNotify } from './orcad-phone-notify'

/**
 * Serves runtime RPC on orcad's pinned listener and, with `--relay` or a desktop-configured relay,
 * through that relay too. Returns the options the pairing offer should read.
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
  const phoneRelay = new OrcadPhoneRelay({ userDataPath: input.userDataPath, rpc })
  // Why the flag wins: it is this launch's posture, while the configured URL is the desktop's choice.
  const relayUrl = options.relay ?? readConfiguredRelayUrl(input.userDataPath)
  if (relayUrl) {
    phoneRelay.start(relayUrl)
  }
  setPhoneRelayControl(phoneRelay)
  // Registered after the RPC stop so it runs first: no relay client is redialed mid-shutdown.
  registerCleanup(() => {
    setPhoneRelayControl(null)
    phoneRelay.stop()
  })
  startOrcadPhoneNotify({
    runtime: input.runtime,
    rpc,
    userDataPath: input.userDataPath,
    registerCleanup
  })
  // Why only --relay moves the offer: a managing desktop pairs itself from it through its tunnel.
  const clientUrl = options.relay ? phoneRelay.clientUrl : null
  return {
    rpc,
    pairingOptions: clientUrl ? withRelayPairingEndpoint(options, clientUrl) : options
  }
}
