import { toast } from 'sonner'
import type { PdfTextSelection } from '@/components/editor/pdf-text-selection'
import { MAX_PDF_TEXT_SELECTION_LENGTH } from '@/components/editor/pdf-text-selection'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import type {
  ExperimentRecord,
  ResearchDelegationRecord
} from '../../../../shared/research/research-records'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { resolveResearchAdoptAgent } from './research-adopt-conversation'
import { nameResearchChat } from './research-chat-label'
import { trackDelegationLaunch } from './research-delegation-launch'
import { useResearchRecords } from './research-records-store'
import {
  buildWritingPdfRevisionPrompt,
  type PdfRevisionSource
} from './research-writing-pdf-agent-send'

/** Project-only manuscripts have no Experiment to bind a Writing chat to. */
export async function startProjectPdfRevision(input: {
  project: Pick<ExperimentRecord, 'hostId' | 'workspaceId' | 'name'>
  source: PdfRevisionSource
  selection: PdfTextSelection
  instruction: string
}): Promise<string | null> {
  if (
    !input.instruction.trim() ||
    !input.selection.text.trim() ||
    input.selection.text.length > MAX_PDF_TEXT_SELECTION_LENGTH ||
    !Number.isSafeInteger(input.selection.pageNumber) ||
    input.selection.pageNumber < 1
  ) {
    return 'Add an instruction and select PDF text on one page.'
  }
  const host = parseExecutionHostId(input.project.hostId)
  if (!host) {
    return 'The project host is unavailable. Reconnect it and try again.'
  }
  const agent = await resolveResearchAdoptAgent(host.id)
  const label = `Revise PDF page ${input.selection.pageNumber}`
  const result = launchAgentInNewTab({
    requestId: newAgentLaunchRequestId(),
    requestedSurface: 'chat',
    selectedExecutionHostId: host.id,
    agent,
    worktreeId: input.project.workspaceId,
    prompt: buildWritingPdfRevisionPrompt(input.source, input.selection, input.instruction),
    promptDelivery: 'auto-submit',
    onStructuredHostDeclined: () => ({ opened: false }),
    activate: false
  })
  if (!result) {
    return 'The project host could not start an agent. Check its agent settings and try again.'
  }
  nameResearchChat(input.project.workspaceId, result, label)
  const now = new Date().toISOString()
  const delegation: ResearchDelegationRecord = {
    id: createBrowserUuid(),
    sourceWorkspaceId: input.project.workspaceId,
    sourceHostId: input.project.hostId,
    sourceExperimentId: null,
    targetWorkspaceId: input.project.workspaceId,
    targetHostId: input.project.hostId,
    targetLabel: input.project.name,
    agent,
    task: label,
    tabId: result.surface.kind === 'host-published' ? null : result.surface.tabId,
    sessionId: null,
    state: 'launching',
    createdAt: now,
    updatedAt: now
  }
  try {
    await useResearchRecords.getState().update((current) => ({
      ...current,
      delegations: [delegation, ...current.delegations].slice(0, 500)
    }))
  } catch (cause) {
    toast.error(
      `The revision agent started, but its Background task could not be saved. ${String(cause)}`
    )
    return null
  }
  trackDelegationLaunch(delegation.id, result)
  toast.success('PDF revision started on the project host. Follow it under Background tasks.')
  return null
}
