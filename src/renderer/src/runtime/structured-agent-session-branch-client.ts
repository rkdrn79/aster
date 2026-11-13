import {
  isAgentSessionBranchResult,
  type AgentSessionBranchParams,
  type AgentSessionBranchResult
} from '../../../shared/agent-session-branch'
import { STRUCTURED_AGENT_SESSION_BRANCH_RUNTIME_CAPABILITY } from '../../../shared/protocol-version'
import type { RuntimeClientTarget } from '../../../shared/runtime-client-target'
import { callRuntimeRpc, runtimeEnvironmentSupportsCapability } from './runtime-rpc-client'
import {
  ensureLocalRuntimeCapabilities,
  readLocalRuntimeCapabilitiesOrUnknown
} from './local-runtime-capabilities'

/** Whether the chat's host can copy a conversation for a branch (`agentSession.prepareBranch`).
 *  An unknown answer is no: a host that never said so is not asked. */
export async function supportsStructuredAgentSessionBranch(
  target: RuntimeClientTarget
): Promise<boolean> {
  try {
    if (target.kind === 'local') {
      const capabilities =
        readLocalRuntimeCapabilitiesOrUnknown() ?? (await ensureLocalRuntimeCapabilities())
      return capabilities?.includes(STRUCTURED_AGENT_SESSION_BRANCH_RUNTIME_CAPABILITY) === true
    }
    return await runtimeEnvironmentSupportsCapability(
      target.environmentId,
      STRUCTURED_AGENT_SESSION_BRANCH_RUNTIME_CAPABILITY
    )
  } catch {
    return false
  }
}

/** The host's copy of a chat's conversation for a branch. Call only after
 *  `supportsStructuredAgentSessionBranch`; a failed call rejects. */
export async function prepareStructuredAgentSessionBranch(
  target: RuntimeClientTarget,
  params: AgentSessionBranchParams
): Promise<AgentSessionBranchResult> {
  const result = await callRuntimeRpc<unknown>(target, 'agentSession.prepareBranch', params, {
    // Codex starts a short-lived app-server to make the copy.
    timeoutMs: 120_000
  })
  if (!isAgentSessionBranchResult(result)) {
    throw new Error('The host answered the branch in a form this version cannot read.')
  }
  return result
}
