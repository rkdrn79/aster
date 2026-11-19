import { ensureLocalRuntimeCapabilities } from '@/runtime/local-runtime-capabilities'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { RuntimeRpcCallError } from '@/runtime/runtime-rpc-result'
import type {
  ResearchPlansApproveResult,
  ResearchPlansBudgetResult,
  ResearchPlansListResult,
  ResearchProposalsDecideResult,
  ResearchProposalsListResult
} from '../../../shared/research/research-decisions-rpc'
import type {
  ResearchPlanApproveInput,
  ResearchPlanOverview
} from '../../../shared/research/research-plans'
import { RESEARCH_DECISIONS_RUNTIME_CAPABILITY } from '../../../shared/research/research-runtime-capabilities'

// Why local: in the web client the local target is the paired host that owns the workspace.
const HOST = { kind: 'local' } as const

/** `unknown` until the host has answered its capabilities; callers then wait, not hide. */
export type HostFeatureSupport = 'supported' | 'update-needed' | 'unknown'

export const HOST_UPDATE_NEEDED_TEXT =
  'This server runs an older Aster. Update it from the desktop (Settings → SSH) to decide here.'

/** Whether the paired host takes proposal and plan decisions (`research.decisions.v1`). */
export async function hostResearchDecisionsSupport(): Promise<HostFeatureSupport> {
  const capabilities = await ensureLocalRuntimeCapabilities()
  if (capabilities === null) {
    return 'unknown'
  }
  return capabilities.includes(RESEARCH_DECISIONS_RUNTIME_CAPABILITY)
    ? 'supported'
    : 'update-needed'
}

/** A host that predates a method answers with an unknown-method error. */
export function isOldHostError(cause: unknown): boolean {
  return (
    (cause instanceof RuntimeRpcCallError && cause.code === 'method_not_found') ||
    /unknown method|method_not_found/i.test(String(cause))
  )
}

const selector = (worktreeId: string): string => `id:${worktreeId}`

export function listHostProposals(
  worktreeId: string,
  options: { state: 'pending' | 'all'; experiment?: string }
): Promise<ResearchProposalsListResult> {
  return callRuntimeRpc(HOST, 'researchProposals.list', {
    worktree: selector(worktreeId),
    ...options
  })
}

export function decideHostProposal(
  worktreeId: string,
  input: { experiment: string; id: string; decision: 'approved' | 'rejected'; note: string | null }
): Promise<ResearchProposalsDecideResult> {
  return callRuntimeRpc(HOST, 'researchProposals.decide', {
    worktree: selector(worktreeId),
    ...input
  })
}

export function listHostPlans(worktreeId: string): Promise<ResearchPlansListResult> {
  return callRuntimeRpc(HOST, 'researchPlans.list', { worktree: selector(worktreeId) })
}

export function readHostPlanOverview(
  worktreeId: string,
  plan: string
): Promise<ResearchPlanOverview> {
  return callRuntimeRpc(HOST, 'researchPlans.overview', { worktree: selector(worktreeId), plan })
}

export function stateHostPlanBudget(
  worktreeId: string,
  plan: string,
  gpuHours: number
): Promise<ResearchPlansBudgetResult> {
  return callRuntimeRpc(HOST, 'researchPlans.budget', {
    worktree: selector(worktreeId),
    plan,
    gpuHours
  })
}

export function approveHostPlan(
  worktreeId: string,
  plan: string,
  input: ResearchPlanApproveInput
): Promise<ResearchPlansApproveResult> {
  return callRuntimeRpc(HOST, 'researchPlans.approve', {
    worktree: selector(worktreeId),
    plan,
    ...input
  })
}
