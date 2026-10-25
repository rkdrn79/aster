import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { OrcaRuntimeRpcServer } from '../runtime/runtime-rpc'
import { resolveOrcadWebClientRoot } from './orcad-command-arguments'
import type { OrcadRuntimeCleanup } from './orcad-runtime-lifetime'
import type { OrcadOptions } from './orcad-start-contract'
import { orcadWsPortOptions } from './orcad-ws-port-policy'

/** Serves runtime RPC on orcad's pinned listener. */
export async function startOrcadRpcServer(input: {
  runtime: OrcaRuntimeService
  options: OrcadOptions
  bindHost: string
  userDataPath: string
  registerCleanup: (cleanup: OrcadRuntimeCleanup) => void
}): Promise<OrcaRuntimeRpcServer> {
  const rpc = new OrcaRuntimeRpcServer({
    runtime: input.runtime,
    userDataPath: input.userDataPath,
    enableWebSocket: true,
    // Why pinned and not `exposeNetworkByDefault`: an unattended host's exposure must be
    // exactly what the operator asked for, on every launch. The default path widens itself
    // once a device has connected, so a loopback deployment would silently go wide one
    // restart after its first client paired.
    pinnedBindHost: input.bindHost,
    webClientRoot: resolveOrcadWebClientRoot(input.options.webClientRoot),
    ...orcadWsPortOptions(input.options.port)
  })
  // Stops first: no RPC may write while the rest of the runtime is torn down.
  input.registerCleanup(() => rpc.stop())
  await rpc.start()
  return rpc
}
