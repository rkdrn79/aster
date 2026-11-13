// `agentSession.prepareBranch` — copies a chat's conversation for a branch, without changing the
// chat. The client starts the branch's own chat from the copy with `agentSession.create`.

import { AgentSessionBranchParamsSchema } from '../../../../shared/agent-session-branch'
import { defineMethod } from '../core'
import {
  prepareStructuredAgentSessionBranch,
  structuredAgentSessionBranchHost
} from '../../structured-agent-session-branch'
import { requireInstalledStructuredHost } from './structured-agent-session-gate'

export const STRUCTURED_AGENT_SESSION_BRANCH_METHODS = [
  defineMethod({
    name: 'agentSession.prepareBranch',
    permission: 'workspace',
    params: AgentSessionBranchParamsSchema,
    handler: async (params, ctx) =>
      prepareStructuredAgentSessionBranch(
        structuredAgentSessionBranchHost(
          await requireInstalledStructuredHost(ctx, params.sessionId)
        ),
        params
      )
  })
]
