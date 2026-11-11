import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import type {
  RebuttalAgentEditMode,
  RebuttalCluster,
  RebuttalMeta,
  RebuttalPromise
} from '../../../../research-harness/research-rebuttal-model.mjs'
import { researchErrorText } from './research-error-text'
import { useReadingLanguage } from './research-reading-language'
import { useResearchRecords } from './research-records-store'
import {
  buildRebuttalPrompt,
  requestSlots,
  requestSummary,
  type RebuttalAgentRequest
} from './research-rebuttal-agent-prompts'
import { sendRebuttalPrompt, type RebuttalAgentScope } from './research-rebuttal-agent-session'
import {
  addRebuttalConcern,
  addRebuttalFollowUp,
  convertRebuttalPrediction,
  dismissRebuttalPrediction,
  markPredictionHandedOff
} from './research-rebuttal-decisions'
import type { RebuttalOwner } from './research-rebuttal-files'
import {
  approveRebuttalPaperChange,
  approveRebuttalPaperChanges,
  rejectRebuttalPaperChange
} from './research-rebuttal-paper-changes'
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
import {
  acceptRebuttalProposal,
  acceptRebuttalProposals,
  discardRebuttalProposal,
  discardRebuttalProposals,
  saveRebuttalReply
} from './research-rebuttal-reply-mutations'
import {
  buildReviewerOpenPrompt,
  buildReviewerChallengePrompt,
  buildReviewerPredictPrompt
} from './research-rebuttal-reviewer-prompts'
import { sendReviewerPrompt } from './research-rebuttal-reviewer-session'
import type { RebuttalSnapshot } from './research-rebuttal-snapshot'
import { beginRebuttalTurn, failRebuttalTurn, newRebuttalTurnId } from './research-rebuttal-turns'
import { selectResearchWorkspaceContext } from './research-workspace-context'
import type { NewRebuttalInput } from './ResearchRebuttalNewDialog'

export type ClusterLinks = {
  experimentName: string | null
  onOpenExperiment: (() => void) | null
  onCreateExperiment: (() => Promise<string | null>) | null
  onOpenWriting: (() => void) | null
}

export type ReviewerAgentRequest = 'weakest' | 'convinced' | 'predict'

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
  const [language] = useReadingLanguage()
  const scope: RebuttalAgentScope = { hostId: owner.hostId, workspaceId: owner.workspaceId }

  const changeCluster = (clusterId: string, patch: Partial<RebuttalCluster>) =>
    attempt(() =>
      updateRebuttalClusters(owner, (clusters) =>
        clusters.map((cluster) => (cluster.id === clusterId ? { ...cluster, ...patch } : cluster))
      )
    )

  const askAgent = async (request: RebuttalAgentRequest): Promise<string | null> => {
    if (!snapshot) {
      return 'Choose a rebuttal first.'
    }
    const turn = newRebuttalTurnId()
    const summary = requestSummary(request)
    beginRebuttalTurn({
      id: turn,
      actor: 'author',
      request: summary,
      slots: requestSlots(snapshot, request)
    })
    const failure = await attempt(async () => {
      const error = await sendRebuttalPrompt(
        scope,
        buildRebuttalPrompt(snapshot, request, turn, language)
      )
      if (error) {
        throw new Error(error)
      }
    })
    if (failure) {
      failRebuttalTurn('author', failure)
    } else {
      callbacks.onAgentAsked()
    }
    return failure
  }

  const askReviewer = async (
    reviewerId: string,
    request: ReviewerAgentRequest
  ): Promise<string | null> => {
    if (!snapshot) {
      return 'Choose a rebuttal first.'
    }
    const slug = snapshot.bundle.meta.slug
    const summary =
      request === 'predict'
        ? `Predict ${reviewerId}'s next concerns`
        : request === 'weakest'
          ? 'Push back on the weakest reply'
          : 'Say which concerns still stand'
    const prompt =
      request === 'predict'
        ? buildReviewerPredictPrompt(snapshot, reviewerId)
        : buildReviewerChallengePrompt(reviewerId, request)
    const actor = `reviewer:${reviewerId}` as const
    beginRebuttalTurn({ id: newRebuttalTurnId(), actor, request: summary, slots: [] })
    const failure = await attempt(async () => {
      const error = await sendReviewerPrompt(scope, slug, reviewerId, prompt, (requested) =>
        buildReviewerOpenPrompt(snapshot, reviewerId, requested)
      )
      if (error) {
        throw new Error(error)
      }
    })
    if (failure) {
      failRebuttalTurn(actor, failure)
    }
    return failure
  }

  return {
    create: (input: NewRebuttalInput) => attempt(() => createRebuttal(owner, input)),
    saveReview: (input: {
      reviewerId: string | null
      text: string
      label: string
      rating?: string | null
      confidence?: string | null
    }) => attempt(async () => callbacks.onReviewSaved(await saveRebuttalReview(owner, input))),
    changeCluster,
    updateMeta: (change: (meta: RebuttalMeta) => RebuttalMeta) =>
      attempt(() => updateRebuttalMeta(owner, change)),
    updatePromises: (change: (promises: RebuttalPromise[]) => RebuttalPromise[]) =>
      attempt(() => updateRebuttalPromises(owner, change)),
    saveReply: (slot: string | null, pointId: string | null, text: string, base: string) =>
      attempt(() => saveRebuttalReply(owner, { slot, pointId, text, base })),
    acceptProposal: (id: string) => attempt(() => acceptRebuttalProposal(owner, id)),
    discardProposal: (id: string) => attempt(() => discardRebuttalProposal(owner, id)),
    acceptProposals: (ids: readonly string[]) =>
      attempt(async () => {
        const failed = await acceptRebuttalProposals(owner, ids)
        if (failed.length) {
          throw new Error(`Could not apply ${failed.join(', ')}; decide them one by one.`)
        }
      }),
    discardProposals: (ids: readonly string[]) =>
      attempt(async () => {
        const failed = await discardRebuttalProposals(owner, ids)
        if (failed.length) {
          throw new Error(
            `Could not undo ${failed.join(', ')}: those replies changed since. Use Versions.`
          )
        }
      }),
    setAgentEdits: (mode: RebuttalAgentEditMode) =>
      attempt(() => updateRebuttalMeta(owner, (meta) => ({ ...meta, agentEdits: mode }))),
    addFollowUp: (reviewerId: string, text: string) =>
      attempt(() => addRebuttalFollowUp(owner, { reviewerId, text })),
    addConcern: (input: Parameters<typeof addRebuttalConcern>[1]) =>
      attempt(() => addRebuttalConcern(owner, input)),
    dismissPrediction: (id: string) => attempt(() => dismissRebuttalPrediction(owner, id)),
    convertPrediction: (id: string) => attempt(() => convertRebuttalPrediction(owner, id)),
    strengthen: (predictionId: string) =>
      attempt(async () => {
        const failure = await askAgent({ kind: 'strengthen', predictionId })
        if (failure) {
          throw new Error(failure)
        }
        await markPredictionHandedOff(owner, predictionId)
      }),
    approvePaperChange: (id: string) => attempt(() => approveRebuttalPaperChange(owner, id)),
    approvePaperChanges: (ids: readonly string[]) =>
      attempt(async () => {
        const failed = await approveRebuttalPaperChanges(owner, ids)
        if (failed.length) {
          throw new Error(failed.map((entry) => `${entry.id}: ${entry.reason}`).join(' '))
        }
      }),
    rejectPaperChange: (id: string) => attempt(() => rejectRebuttalPaperChange(owner, id)),
    askAgent,
    askReviewer,
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

export type RebuttalActions = ReturnType<typeof useResearchRebuttalActions>
