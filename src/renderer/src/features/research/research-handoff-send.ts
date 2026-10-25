import type { ResearchAnalysisItem } from '../../../../shared/research/research-analysis'
import type { ResearchFinding } from '../../../../shared/research/research-quality-findings'
import type { ResearchProposal } from '../../../../shared/research/research-proposals'
import type { ExperimentRecord } from '../../../../shared/research/research-records'
import { formatAgentTypeLabel } from '../../../../shared/agent-type-label'
import type { Tab } from '../../../../shared/tab-types'
import { useAppStore } from '@/store'
import { launchResearchChat, researchChatSessionTabs } from './ResearchAgentChatPane'
import {
  researchChatTab,
  reviewChatAgent,
  sendToResearchChat,
  type AgentReviewOutcome
} from './research-agent-review-launch'
import { linkResearchConversation } from './research-conversation-link'
import { researchErrorText } from './research-error-text'
import { researchChatTitle } from './research-chat-label'
import {
  buildUseInPaperPrompt,
  buildWorkbenchTaskPacket,
  workbenchHandoffChat,
  type HandoffHarness
} from './research-handoff-prompts'
import { useResearchLibrary } from './research-library-store'
import { useResearchRecords } from './research-records-store'
import { launchWritingAgent } from './research-writing-agent-session'
import {
  catalogRunReference,
  harnessExperimentSlug,
  researchHarnessBridge
} from './use-research-harness-experiment'

/** A chat's name as the sidebar shows it. */
export function researchChatLabel(tab: Tab | undefined): string {
  if (!tab) {
    return 'a chat that is not open'
  }
  return (
    tab.customLabel ??
    tab.aiVaultTitle?.title ??
    (tab.label ||
      (tab.agentSessionAgent ? formatAgentTypeLabel(tab.agentSessionAgent) : 'Agent chat'))
  )
}

async function handoffHarness(experiment: ExperimentRecord): Promise<HandoffHarness> {
  const location = researchHarnessBridge().location
  if (!location) {
    throw new Error('This window cannot reach the research harness. Reload Aster.')
  }
  return { cli: (await location()).cli, projectPath: experiment.workspacePath }
}

function runNameIn(experiment: ExperimentRecord): (reference: string) => string {
  const runs = (useResearchRecords.getState().document?.runs ?? []).filter(
    (run) => run.hostId === experiment.hostId && run.workspacePath === experiment.workspacePath
  )
  return (reference) =>
    runs.find((run) => catalogRunReference(run) === reference)?.name ?? reference
}

export type WorkbenchHandoff =
  | { ok: true; proposal: ResearchProposal; sessionId: string; label: string }
  | { ok: false; message: string }

/**
 * "Implement in Workbench": sends the approved `needsCode` proposal's task packet to the Workbench
 * chat linked to this Experiment, or to a new Workbench chat it links, then records the handoff.
 */
export async function handProposalToWorkbench(
  experiment: ExperimentRecord,
  proposal: ResearchProposal,
  findings: readonly ResearchFinding[]
): Promise<WorkbenchHandoff> {
  const slug = harnessExperimentSlug(experiment)
  const record = (window.api.researchProposals ?? {}).handoff
  const records = useResearchRecords.getState().document
  if (!slug || !record || !records) {
    return { ok: false, message: 'Reload Aster to hand proposals to Workbench.' }
  }
  try {
    const packet = buildWorkbenchTaskPacket({
      proposal,
      experimentName: experiment.name,
      harness: await handoffHarness(experiment),
      findings: findings.filter((finding) => proposal.findings.includes(finding.id)),
      runName: runNameIn(experiment)
    })
    const { workspaceId, hostId } = experiment
    const state = useAppStore.getState()
    const linked = workbenchHandoffChat({
      tabs: researchChatSessionTabs(state, state.unifiedTabsByWorktree[workspaceId] ?? [], hostId),
      records,
      library: useResearchLibrary.getState().document,
      hostId,
      workspaceId,
      experimentId: experiment.id,
      preferredSessionId: proposal.handoff?.sessionId ?? null
    })
    let sessionId: string
    if (linked) {
      const sent = await sendToResearchChat(workspaceId, linked.entityId, packet)
      if (!sent?.ok) {
        return {
          ok: false,
          message: sent?.message ?? `“${researchChatLabel(linked)}” cannot take a message now.`
        }
      }
      sessionId = linked.entityId
    } else {
      const started = await launchResearchChat({
        hostId,
        workspaceId,
        agent: reviewChatAgent(),
        prompt: packet,
        label: researchChatTitle('Implement', proposal.title)
      })
      if ('error' in started) {
        return { ok: false, message: started.error }
      }
      sessionId = started.sessionId
      const tab = researchChatTab(workspaceId, sessionId)
      if (tab) {
        // Why not fatal: the packet is already in the new chat; only its sidebar placement fails.
        await linkResearchConversation({ tabId: tab.id, workspaceId, hostId }, experiment.id).catch(
          () => undefined
        )
      }
    }
    const { proposal: handed } = await record({
      workspacePath: experiment.workspacePath,
      experiment: slug,
      id: proposal.id,
      sessionId
    })
    return {
      ok: true,
      proposal: handed,
      sessionId,
      label: researchChatLabel(researchChatTab(workspaceId, sessionId))
    }
  } catch (cause) {
    return { ok: false, message: researchErrorText(cause) }
  }
}

/** "Use in paper": asks the Experiment's Writing agent to put the analysis in the manuscript. */
export async function sendAnalysisToWriting(
  experiment: ExperimentRecord,
  analysis: ResearchAnalysisItem
): Promise<AgentReviewOutcome> {
  try {
    const current =
      useResearchRecords
        .getState()
        .document?.experiments.find((entry) => entry.id === experiment.id) ?? experiment
    const prompt = buildUseInPaperPrompt({
      analysis,
      experimentName: current.name,
      harness: await handoffHarness(current),
      manuscript: current.manuscript?.sourcePath ?? null,
      runName: runNameIn(current)
    })
    const sent = current.writingAgentSessionId
      ? await sendToResearchChat(current.workspaceId, current.writingAgentSessionId, prompt)
      : null
    if (sent) {
      return sent
    }
    const error = await launchWritingAgent(current, reviewChatAgent(), prompt)
    return error ? { ok: false, message: error } : { ok: true }
  } catch (cause) {
    return { ok: false, message: researchErrorText(cause) }
  }
}
