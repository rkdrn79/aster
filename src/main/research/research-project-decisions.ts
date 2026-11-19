import {
  layoutRelativePaths,
  experimentRelativePath
} from '../../research-harness/research-layout.mjs'
import { approvePlan, planOverview } from '../../research-harness/research-plan-approval.mjs'
import { listPlans, setPlanBudget } from '../../research-harness/research-plan.mjs'
import { decideProposal, listProposals } from '../../research-harness/research-proposals.mjs'
import type {
  ResearchPlanApproveInput,
  ResearchPlanApproveResult,
  ResearchPlanBudgetResult,
  ResearchPlanList,
  ResearchPlanOverview
} from '../../shared/research/research-plans'
import type { ResearchProposalsListResult } from '../../shared/research/research-decisions-rpc'
import type { ResearchProposal } from '../../shared/research/research-proposals'
import {
  approveResearchPlan,
  decideResearchProposal,
  listResearchPlans,
  listResearchProposals,
  readResearchPlanOverview,
  stateResearchPlanBudget,
  type ResearchDecisionHarness,
  type ResearchProposalDecision
} from './research-decision-calls'
import { readResearchProjectCatalog } from './research-project-catalog-read'
import { resolveResearchProjectPath, type ResearchProjectRoot } from './research-project-files'

/** The harness built into this host (orcad or the desktop's main process). */
const bundledHarness: ResearchDecisionHarness = {
  listProposals,
  decideProposal,
  listPlans,
  planOverview,
  setPlanBudget,
  approvePlan
}

// Why check first: the harness follows the layout as found, so a records folder linked out of
// the workspace is refused here, as the reads refuse it.
async function checkedExperiment(root: ResearchProjectRoot, slug: string): Promise<void> {
  await resolveResearchProjectPath(root, experimentRelativePath(root.path, slug))
}

async function checkedPlans(root: ResearchProjectRoot): Promise<void> {
  await resolveResearchProjectPath(root, `${layoutRelativePaths(root.path).root}/plans`)
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** One Experiment's proposals, or every catalog Experiment's in catalog order. */
export async function listResearchProjectProposals(
  root: ResearchProjectRoot,
  params: { experiment?: string; state?: string }
): Promise<ResearchProposalsListResult> {
  let slugs: string[]
  if (params.experiment) {
    slugs = [params.experiment]
  } else {
    const catalog = await readResearchProjectCatalog(root)
    slugs =
      catalog.file.status === 'present'
        ? catalog.file.value.experiments.map((experiment) => experiment.slug)
        : []
  }
  const result: ResearchProposalsListResult = { proposals: [], unreadable: [] }
  for (const slug of slugs) {
    try {
      await checkedExperiment(root, slug)
      const { proposals } = await listResearchProposals(
        bundledHarness,
        root.path,
        slug,
        params.state ?? 'all'
      )
      result.proposals.push(...proposals)
    } catch (error) {
      result.unreadable.push({ experiment: slug, reason: reasonOf(error) })
    }
  }
  return result
}

export async function decideResearchProjectProposal(
  root: ResearchProjectRoot,
  input: ResearchProposalDecision
): Promise<ResearchProposal> {
  await checkedExperiment(root, input.experiment)
  return decideResearchProposal(bundledHarness, root.path, input)
}

export async function listResearchProjectPlans(
  root: ResearchProjectRoot
): Promise<ResearchPlanList> {
  await checkedPlans(root)
  return listResearchPlans(bundledHarness, root.path)
}

export async function readResearchProjectPlanOverview(
  root: ResearchProjectRoot,
  plan: string
): Promise<ResearchPlanOverview> {
  await checkedPlans(root)
  return readResearchPlanOverview(bundledHarness, root.path, plan)
}

export async function stateResearchProjectPlanBudget(
  root: ResearchProjectRoot,
  plan: string,
  input: { gpuHours: number; hardware?: string }
): Promise<ResearchPlanBudgetResult> {
  await checkedPlans(root)
  return stateResearchPlanBudget(bundledHarness, root.path, plan, input)
}

export async function approveResearchProjectPlan(
  root: ResearchProjectRoot,
  plan: string,
  input: ResearchPlanApproveInput
): Promise<ResearchPlanApproveResult> {
  await checkedPlans(root)
  return approveResearchPlan(bundledHarness, root.path, plan, input)
}
