import type { AgentSessionBranchCopy } from '../../shared/agent-session-branch'
import {
  isLegacyAgentSessionAccountHome,
  requireLegacyAgentSessionAccountHome
} from '../../shared/agent-session-account-home'
import { agentSessionProviderHandleChainHead } from '../../shared/agent-session-provider-handle'
import type { StructuredAgentSessionAdapter } from '../native-chat/agent-session-wire/structured-agent-session-adapter'
import {
  LEGACY_NATIVE_CHAT_VISUALS_DIR_ENV,
  NATIVE_CHAT_SCRATCH_DIR_ENV
} from '../native-chat/native-chat-visuals-delivery'
import {
  isCodexAppServerUnsupportedError,
  runCodexAppServerSession,
  type CodexAppServerRpc
} from './codex-app-server-session'
import { codexStructuredLaunchArgs } from './codex-structured-launch-args'
import {
  resolveCodexStructuredInvocation,
  type CodexStructuredInvocationDeps
} from './codex-structured-launch-resolution'
import { supportsCodexStructuredLocation } from './codex-structured-location-support'
import { readCodexThreadId } from './codex-structured-thread-facts'

/** One fork, start to reap: Codex copies the thread from its saved rollout. */
const FORK_SESSION_TIMEOUT_MS = 90_000

export type CodexBranchForkDeps = CodexStructuredInvocationDeps & {
  resolveLaunchArgs: () => Promise<string[]> | string[]
  resolveWorkspacePath: (workspaceId: string) => Promise<string>
  /** Test seam. */
  runSession?: typeof runCodexAppServerSession
}

function definedEnv(env: NodeJS.ProcessEnv | undefined): Record<string, string> {
  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(env ?? {})) {
    if (value !== undefined) {
      next[key] = value
    }
  }
  return next
}

function firstTurnId(page: unknown): string | null {
  const data: unknown = page && typeof page === 'object' ? Reflect.get(page, 'data') : undefined
  const first: unknown = Array.isArray(data) ? data[0] : undefined
  const id: unknown = first && typeof first === 'object' ? Reflect.get(first, 'id') : undefined
  return typeof id === 'string' && id ? id : null
}

/**
 * `thread/fork` of `threadId` through `lastTurnId` (inclusive; all turns when null), answered with
 * the new thread. A Codex that ignored `lastTurnId` would copy turns the branch must not have, so
 * the copy's newest turn is checked before anything adopts it.
 */
export async function forkCodexThread(
  rpc: Pick<CodexAppServerRpc, 'request'>,
  threadId: string,
  lastTurnId: string | null
): Promise<AgentSessionBranchCopy> {
  let forked: unknown
  try {
    forked = await rpc.request('thread/fork', {
      threadId,
      ...(lastTurnId ? { lastTurnId } : {}),
      excludeTurns: true
    })
  } catch (error) {
    return {
      ok: false,
      reason: isCodexAppServerUnsupportedError(error) ? 'unsupported' : 'provider-refused'
    }
  }
  const forkId = readCodexThreadId(forked)
  if (!forkId || forkId === threadId) {
    return { ok: false, reason: 'provider-refused' }
  }
  if (lastTurnId) {
    const newest = await rpc
      .request('thread/turns/list', {
        threadId: forkId,
        cursor: null,
        sortDirection: 'desc',
        limit: 1
      })
      .then(firstTurnId, () => null)
    if (newest !== lastTurnId) {
      return { ok: false, reason: 'provider-refused' }
    }
  }
  return { ok: true, providerSessionId: forkId }
}

/**
 * The Codex adapter's branch: a short-lived app-server on the chat's own Codex home makes the copy,
 * so the chat's running app-server never sees a second thread. Codex cuts at whole turns.
 */
export function createCodexBranchFork(
  deps: CodexBranchForkDeps
): NonNullable<StructuredAgentSessionAdapter['forkForBranch']> {
  return async ({ record, cut }) => {
    if (
      record.provider !== 'codex' ||
      !isLegacyAgentSessionAccountHome(record.accountHome) ||
      !supportsCodexStructuredLocation(record.location)
    ) {
      return { ok: false, reason: 'unsupported' }
    }
    const head = agentSessionProviderHandleChainHead(record.providerHandleChain)?.handle
    if (!head) {
      return { ok: false, reason: 'not-saved' }
    }
    if (cut.kind === 'before-message' || cut.kind === 'through-entry') {
      return { ok: false, reason: 'invalid-target' }
    }
    if (cut.kind === 'none' || (cut.kind === 'before-turn' && cut.keptTurnId === null)) {
      return { ok: true, providerSessionId: null }
    }
    const lastTurnId = cut.kind === 'before-turn' ? cut.keptTurnId : null
    const codexHome = requireLegacyAgentSessionAccountHome(record.accountHome).path
    const cwd = await deps.resolveWorkspacePath(record.location.workspaceId)
    const { command, environment } = await resolveCodexStructuredInvocation({
      ...deps,
      resolveWorkingDirectory: () => cwd
    })
    const args = codexStructuredLaunchArgs(await deps.resolveLaunchArgs())
    return (deps.runSession ?? runCodexAppServerSession)(
      {
        command,
        args: [...args, 'app-server'],
        cwd,
        cliPath: command,
        env: { ...definedEnv(environment), CODEX_HOME: codexHome },
        envToDelete: [NATIVE_CHAT_SCRATCH_DIR_ENV, LEGACY_NATIVE_CHAT_VISUALS_DIR_ENV],
        timeoutMs: FORK_SESSION_TIMEOUT_MS,
        treeKillOnFinish: true
      },
      (rpc) => forkCodexThread(rpc, head.nativeId, lastTurnId)
    )
  }
}
