import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'
import type {
  ResearchProjectReadResult,
  ResearchProjectRunLogTailResult,
  ResearchProjectRunReadResult
} from '../../../../shared/research/research-project-api'
import type { ResearchProjectLibraryReadResult } from '../../../../shared/research/research-project-library-api'

/**
 * `researchProject.*` reads on the host that owns a workspace. These work wherever the
 * runtime answers, unlike the desktop-only research IPC bridges.
 */
export function readResearchProjectOnHost(
  target: RuntimeClientTarget,
  worktreeId: string
): Promise<ResearchProjectReadResult> {
  return callRuntimeRpc<ResearchProjectReadResult>(target, 'researchProject.read', {
    worktree: `id:${worktreeId}`
  })
}

export function readResearchProjectRunOnHost(
  target: RuntimeClientTarget,
  args: { worktreeId: string; experiment: string; run: string; maxPoints?: number }
): Promise<ResearchProjectRunReadResult> {
  return callRuntimeRpc<ResearchProjectRunReadResult>(target, 'researchProject.runRead', {
    worktree: `id:${args.worktreeId}`,
    experiment: args.experiment,
    run: args.run,
    ...(args.maxPoints ? { maxPoints: args.maxPoints } : {})
  })
}

export function readResearchProjectRunLogTailOnHost(
  target: RuntimeClientTarget,
  args: { worktreeId: string; experiment: string; run: string; maxBytes?: number }
): Promise<ResearchProjectRunLogTailResult> {
  return callRuntimeRpc<ResearchProjectRunLogTailResult>(target, 'researchProject.runLogTail', {
    worktree: `id:${args.worktreeId}`,
    experiment: args.experiment,
    run: args.run,
    ...(args.maxBytes ? { maxBytes: args.maxBytes } : {})
  })
}

export function readResearchProjectLibraryOnHost(
  target: RuntimeClientTarget,
  worktreeId: string
): Promise<ResearchProjectLibraryReadResult> {
  return callRuntimeRpc<ResearchProjectLibraryReadResult>(target, 'researchProject.libraryRead', {
    worktree: `id:${worktreeId}`
  })
}
