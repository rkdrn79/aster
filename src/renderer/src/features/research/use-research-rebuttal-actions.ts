import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import type {
  RebuttalCluster,
  RebuttalMeta,
  RebuttalPromise
} from '../../../../research-harness/research-rebuttal-model.mjs'
import type { ClusterLinks } from './ResearchRebuttalClusterCard'
import { researchErrorText } from './research-error-text'
import { useResearchRecords } from './research-records-store'
import { buildRebuttalPrompt, type RebuttalAgentRequest } from './research-rebuttal-agent-prompts'
import {
  rebuttalAgentSessionId,
  sendRebuttalPrompt,
  type RebuttalAgentScope
} from './research-rebuttal-agent-session'
import type { RebuttalOwner } from './research-rebuttal-files'
import {
  clusterExperiment,
  createClusterExperiment,
  openClusterExperiment,
  openClusterInWriting
} from './research-rebuttal-links'
import {
  createRebuttal,
  saveRebuttalReview,
  updateRebuttalClusters,
  updateRebuttalMeta,
  updateRebuttalPromises
} from './research-rebuttal-mutations'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import { researchWindowSurfaceTarget } from './research-window-surface'
import type { NewRebuttalInput } from './ResearchRebuttalNewDialog'
import type { ReviewSaveInput } from './ResearchRebuttalReviews'

/** Runs a save and turns a failure into the message the page shows next to the control. */
async function attempt(task: () => Promise<unknown>): Promise<string | null> {
  try {
    await task()
    return null
  } catch (cause) {
    return researchErrorText(cause)
  }
}

/** Every write the Rebuttal page makes, each resolving to an error message or null. */
export function useResearchRebuttalActions(
  owner: RebuttalOwner,
  snapshot: RebuttalSnapshot | null,
  callbacks: { onReviewSaved: (reviewerId: string) => void; onAgentAsked: () => void }
) {
  const context = useAppStore(useShallow(selectResearchWorkspaceContext))
  const records = useResearchRecords((state) => state.document)
  const scope: RebuttalAgentScope = { hostId: owner.hostId, workspaceId: owner.workspaceId }

  const changeCluster = (clusterId: string, patch: Partial<RebuttalCluster>) =>
    attempt(() =>
      updateRebuttalClusters(owner, (clusters) =>
        clusters.map((cluster) => (cluster.id === clusterId ? { ...cluster, ...patch } : cluster))
      )
    )

  return {
    create: (input: NewRebuttalInput) => attempt(() => createRebuttal(owner, input)),
    saveReview: (input: ReviewSaveInput) =>
      attempt(async () => callbacks.onReviewSaved(await saveRebuttalReview(owner, input))),
    changeCluster,
    updateMeta: (change: (meta: RebuttalMeta) => RebuttalMeta) =>
      attempt(() => updateRebuttalMeta(owner, change)),
    updatePromises: (change: (promises: RebuttalPromise[]) => RebuttalPromise[]) =>
      attempt(() => updateRebuttalPromises(owner, change)),
    askAgent: async (request: RebuttalAgentRequest): Promise<string | null> => {
      if (!snapshot) {
        return 'Choose a rebuttal first.'
      }
      if (researchWindowSurfaceTarget() && !rebuttalAgentSessionId(records, scope)) {
        return 'Start the Rebuttal chat in the main window first.'
      }
      const failure = await attempt(async () => {
        const error = await sendRebuttalPrompt(scope, buildRebuttalPrompt(snapshot, request))
        if (error) {
          throw new Error(error)
        }
      })
      if (!failure) {
        callbacks.onAgentAsked()
      }
      return failure
    },
    linksFor: (cluster: RebuttalCluster): ClusterLinks => {
      const experiment = clusterExperiment(records, owner, cluster)
      const manuscript = cluster.manuscript
      return {
        experimentName: experiment?.name ?? cluster.experiment,
        onOpenExperiment: experiment ? () => void openClusterExperiment(experiment) : null,
        onCreateExperiment: () =>
          attempt(async () => {
            const value = await createClusterExperiment(context, cluster)
            const failure = await changeCluster(cluster.id, { experiment: value })
            if (failure) {
              throw new Error(failure)
            }
          }),
        onOpenWriting: manuscript ? () => openClusterInWriting(owner, manuscript) : null
      }
    }
  }
}
