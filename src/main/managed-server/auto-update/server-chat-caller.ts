/**
 * The chat calls the server-update scheduler makes, over the managed server's ensured tunnel the
 * way the terminal census does, so they never wait on the host's lifecycle queue the update holds.
 */
import type { AgentSessionStatusSummary } from '../../../shared/agent-session-wire'
import { ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES } from '../../../shared/electron-remote-runtime-client-capabilities'
import {
  sendRemoteRuntimeRequest,
  subscribeRemoteRuntimeRequest
} from '../../../shared/remote-runtime-client'
import { getPreferredPairedRuntimeConnection } from '../../../shared/runtime-environments'
import { ensureOrcadManagedTunnel } from '../lifecycle/orcad-managed-tunnel'
import type { ServerChatCaller } from './server-chat-activity'

const CALL_TIMEOUT_MS = 15_000
const SNAPSHOT_TIMEOUT_MS = 10_000

async function connectionFor(userDataPath: string, environmentId: string) {
  // Why its answer: the tunnel may have re-paired, retiring the stored environment's token.
  return getPreferredPairedRuntimeConnection(
    await ensureOrcadManagedTunnel(userDataPath, environmentId)
  )
}

function isStatusSnapshot(value: unknown): value is { sessions: AgentSessionStatusSummary[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    Reflect.get(value, 'type') === 'snapshot' &&
    Array.isArray(Reflect.get(value, 'sessions'))
  )
}

export function managedServerChatCaller(
  userDataPath: string,
  environmentId: string
): ServerChatCaller {
  return {
    statusSnapshot: async () => {
      const connection = await connectionFor(userDataPath, environmentId)
      return new Promise<AgentSessionStatusSummary[]>((resolve, reject) => {
        let settled = false
        let close = (): void => {}
        const finish = (answer: () => void): void => {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            close()
            answer()
          }
        }
        const timer = setTimeout(
          () => finish(() => reject(new Error('The server did not send its chat status.'))),
          SNAPSHOT_TIMEOUT_MS
        )
        subscribeRemoteRuntimeRequest<unknown>(
          connection,
          'agentSession.subscribeStatus',
          {},
          SNAPSHOT_TIMEOUT_MS,
          {
            onResponse: (response) => {
              if (!response.ok) {
                finish(() => reject(new Error(response.error.message)))
              } else if (isStatusSnapshot(response.result)) {
                const { sessions } = response.result
                finish(() => resolve(sessions))
              }
            },
            onError: (error) => finish(() => reject(new Error(error.message))),
            onClose: () => finish(() => reject(new Error('The chat status stream closed.')))
          },
          { clientCapabilities: ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES }
        ).then(
          (subscription) => {
            close = () => subscription.close()
            if (settled) {
              subscription.close()
            }
          },
          (error: unknown) => finish(() => reject(error))
        )
      })
    },
    call: async (method, params) => {
      const response = await sendRemoteRuntimeRequest<unknown>(
        await connectionFor(userDataPath, environmentId),
        method,
        params,
        CALL_TIMEOUT_MS,
        undefined,
        undefined,
        ELECTRON_REMOTE_RUNTIME_CLIENT_CAPABILITIES
      )
      if (!response.ok) {
        throw new Error(response.error.message)
      }
      return response.result
    }
  }
}
