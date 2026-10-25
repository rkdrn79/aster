import { AGENT_SESSION_COHERENT_MODEL_CATALOG_CAPABILITY } from '../../../src/shared/structured-agent-session-surface-capabilities'
import { AGENT_SESSION_CURRENT_REQUESTS_CLIENT_CAPABILITY } from '../../../src/shared/agent-session-current-requests-capability'
import {
  AGENT_SESSION_PENDING_SEND_RESULT_RUNTIME_CAPABILITY,
  AGENT_STATUS_RESTORED_UNCONFIRMED_RUNTIME_CAPABILITY,
  AGENT_SESSION_TURN_ITEM_CAPABILITY,
  CLAUDE_STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
  PI_STRUCTURED_DIALOGS_RUNTIME_CAPABILITY,
  SESSION_TABS_SPLIT_GROUP_PLACEMENT_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_HOLD_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_REGISTERED_AGENTS_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY
} from '../../../src/shared/protocol-version'
import {
  AGENT_LAUNCH_RUNTIME_CAPABILITY,
  AGENT_LAUNCH_TAB_CLOSED_CLIENT_CAPABILITY,
  AGENT_LAUNCH_UNSTARTED_TAB_CLIENT_CAPABILITY
} from '../../../src/shared/agent-launch-runtime-capability'
import { AGENT_SESSION_OPTIONAL_MODEL_CLIENT_CAPABILITY } from '../../../src/shared/agent-session-optional-model-capability'
import { remoteRuntimeClientCapabilities } from '../../../src/shared/remote-runtime-client-capabilities'
import { AGENT_SESSION_CREATE_MESSAGE_RUNTIME_CAPABILITY } from '../../../src/shared/agent-session-create-capabilities'
import { pairedRuntimeConnectionFromOffer } from '../../../src/shared/paired-runtime-connection'
import { decodePairingOffer, type PairingOffer } from '../../../src/shared/pairing'
import {
  sendRemoteRuntimeRequest,
  subscribeRemoteRuntimeRequest,
  type RemoteRuntimeSubscription,
  type RemoteRuntimeSubscriptionCallbacks
} from '../../../src/shared/remote-runtime-client'
import type { RuntimeRpcResponse } from '../../../src/shared/runtime-rpc-envelope'
import { openRemoteRuntimePassthroughSocket } from '../../../src/shared/remote-runtime-passthrough-socket'
import type { RuntimeCapability } from '../../../src/shared/protocol-version'
import {
  decodeBrowserScreencastFrame,
  type BrowserScreencastFrame
} from '../../../src/shared/browser-screencast-protocol'
import {
  decodeTerminalStreamFrame,
  decodeTerminalStreamText,
  TerminalStreamOpcode
} from '../../../src/shared/terminal-stream-protocol'
import type { RuntimeDesktopPairingOffer } from './paired-electron-client'

const DEFAULT_TIMEOUT_MS = 15_000

// The capability list the removed phone client last advertised, so specs keep a phone's view.
const MOBILE_RUNTIME_CLIENT_CAPABILITIES = remoteRuntimeClientCapabilities([
  AGENT_SESSION_COHERENT_MODEL_CATALOG_CAPABILITY,
  STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
  AGENT_SESSION_CURRENT_REQUESTS_CLIENT_CAPABILITY,
  AGENT_SESSION_PENDING_SEND_RESULT_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_HOLD_RUNTIME_CAPABILITY,
  CLAUDE_STRUCTURED_AGENT_SESSION_RUNTIME_CAPABILITY,
  STRUCTURED_AGENT_SESSION_REGISTERED_AGENTS_RUNTIME_CAPABILITY,
  PI_STRUCTURED_DIALOGS_RUNTIME_CAPABILITY,
  AGENT_SESSION_OPTIONAL_MODEL_CLIENT_CAPABILITY,
  SESSION_TABS_SPLIT_GROUP_PLACEMENT_RUNTIME_CAPABILITY,
  AGENT_SESSION_TURN_ITEM_CAPABILITY,
  AGENT_LAUNCH_RUNTIME_CAPABILITY,
  AGENT_LAUNCH_UNSTARTED_TAB_CLIENT_CAPABILITY,
  AGENT_LAUNCH_TAB_CLOSED_CLIENT_CAPABILITY,
  AGENT_STATUS_RESTORED_UNCONFIRMED_RUNTIME_CAPABILITY,
  AGENT_SESSION_CREATE_MESSAGE_RUNTIME_CAPABILITY
])

/**
 * A phone paired to one runtime: the mobile-scoped device token and the phone app's own
 * capability list, over the app's E2EE transport. Each request opens a fresh socket, so requests
 * reach a restarted host; subscriptions do not reconnect across a host restart.
 */
export type PairedMobileClient = {
  /** Raw response, for asserting a refusal. */
  request: <T>(
    method: string,
    params?: unknown,
    timeoutMs?: number
  ) => Promise<RuntimeRpcResponse<T>>
  /** Result of a call that must succeed; throws with the host's error code otherwise. */
  call: <T>(method: string, params?: unknown, timeoutMs?: number) => Promise<T>
  subscribe: <T>(
    method: string,
    params: unknown,
    callbacks: RemoteRuntimeSubscriptionCallbacks<T>,
    timeoutMs?: number
  ) => Promise<RemoteRuntimeSubscription>
  /** One persistent phone socket, as the app holds one; needed for streams and `executionHost`. */
  openSocket: () => Promise<PairedMobileSocket>
  /** Closes every subscription and socket this client opened. */
  dispose: () => void
}

/** Raw frames over one authenticated phone socket, exactly as the app writes them. */
export type PairedMobileSocket = {
  token: string
  /** Every text frame received, parsed, in order. */
  frames: { id?: string; ok?: boolean; result?: unknown; error?: { code: string } }[]
  /** Terminal output text per stream id, decoded from binary frames. */
  output: Map<number, string>
  /** Browser screencast frames, decoded from binary frames, in order. */
  screencastFrames: BrowserScreencastFrame[]
  send: (id: string, method: string, params: unknown, executionHost?: string) => void
  /** Resolves the moment `text` appears in the stream's output, so callers can time an echo. */
  waitForOutput: (streamId: number, text: string, timeoutMs: number) => Promise<void>
  close: () => void
}

/** `capabilities` defaults to the phone's list; a mixed-version test passes a released phone's. */
export function pairMobileClient(
  offer: RuntimeDesktopPairingOffer,
  capabilities: readonly RuntimeCapability[] = MOBILE_RUNTIME_CLIENT_CAPABILITIES
): PairedMobileClient {
  const pairing = decodePairingOffer(offer.pairingUrl)
  // Why: a runtime-scope token skips the mobile allowlist, so the oracle would not be a phone.
  if (pairing.scope !== 'mobile') {
    throw new Error(`Expected a mobile-scoped pairing offer, got scope ${String(pairing.scope)}`)
  }
  const connection = pairedRuntimeConnectionFromOffer(pairing)
  const open = new Set<{ close: () => void }>()
  const request = <T>(
    method: string,
    params: unknown = {},
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<RuntimeRpcResponse<T>> =>
    sendRemoteRuntimeRequest<T>(
      connection,
      method,
      params,
      timeoutMs,
      undefined,
      undefined,
      capabilities
    )
  return {
    request,
    call: async <T>(method: string, params?: unknown, timeoutMs?: number): Promise<T> => {
      const response = await request<T>(method, params, timeoutMs)
      if (!response.ok) {
        throw new Error(`${method} failed: ${response.error.code}: ${response.error.message}`)
      }
      return response.result
    },
    subscribe: async (method, params, callbacks, timeoutMs = DEFAULT_TIMEOUT_MS) => {
      const subscription = await subscribeRemoteRuntimeRequest(
        connection,
        method,
        params,
        timeoutMs,
        callbacks,
        { clientCapabilities: capabilities }
      )
      open.add(subscription)
      return subscription
    },
    openSocket: async () => {
      const socket = await openPairedSocket(pairing, capabilities)
      open.add(socket)
      return socket
    },
    dispose: () => {
      for (const subscription of open) {
        subscription.close()
      }
      open.clear()
    }
  }
}

/** A persistent socket for `pairing` (any scope), speaking the phone's capabilities by default. */
export async function openPairedSocket(
  pairing: PairingOffer,
  capabilities: readonly RuntimeCapability[] = MOBILE_RUNTIME_CLIENT_CAPABILITIES
): Promise<PairedMobileSocket> {
  const frames: PairedMobileSocket['frames'] = []
  const output = new Map<number, string>()
  const screencastFrames: BrowserScreencastFrame[] = []
  const waiters = new Set<() => void>()
  const socket = await openRemoteRuntimePassthroughSocket(
    pairedRuntimeConnectionFromOffer(pairing),
    capabilities,
    {
      onText: (plaintext) => frames.push(JSON.parse(plaintext)),
      onBinary: (bytes) => {
        const screencast = decodeBrowserScreencastFrame(bytes)
        if (screencast) {
          screencastFrames.push(screencast)
          return
        }
        const frame = decodeTerminalStreamFrame(bytes)
        if (frame?.opcode === TerminalStreamOpcode.Output) {
          const text = decodeTerminalStreamText(frame.payload)
          output.set(frame.streamId, (output.get(frame.streamId) ?? '') + text)
          for (const check of waiters) {
            check()
          }
        }
      },
      onClose: () => {}
    },
    { timeoutMs: DEFAULT_TIMEOUT_MS }
  )
  return {
    token: pairing.deviceToken,
    frames,
    output,
    screencastFrames,
    send: (id, method, params, executionHost) =>
      void socket.send(
        JSON.stringify({ id, deviceToken: pairing.deviceToken, method, params, executionHost })
      ),
    waitForOutput: (streamId, text, timeoutMs) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(check)
          reject(new Error(`stream ${streamId} never printed ${text}`))
        }, timeoutMs)
        const check = (): void => {
          if (output.get(streamId)?.includes(text)) {
            clearTimeout(timer)
            waiters.delete(check)
            resolve()
          }
        }
        waiters.add(check)
        check()
      }),
    close: () => socket.close()
  }
}
