import type { ExperimentRecord } from '../../../../shared/research/research-records'
import type { ResearchClaimAudit } from '../../../../shared/research/research-harness-results'
import { getDiskBaselineSignature } from '../../../../shared/disk-baseline-signature'
import { notifyEditorExternalFileChange } from '@/components/editor/editor-autosave'
import { isEditorModelDirty } from '@/components/editor/editor-save-disk-precondition'
import { writeRuntimeFile } from '@/runtime/runtime-file-mutation-client'
import { useAppStore } from '@/store'
import { structuredAgentSessionOwnerForTab } from '@/runtime/structured-agent-session-owner'
import { reviewChatAgent } from './research-agent-review-launch'
import { claimEvidenceText, claimProblemText } from './research-claims-summary'
import { applyClaimTextUpdate, claimTextUpdate } from './research-claims-text-update'
import { researchErrorText } from './research-error-text'
import {
  buildWritingAgentFileEditPrompt,
  sendWritingAgentRevision
} from './research-writing-agent-send'
import { validateWritingAgentBinding } from './research-writing-agent-binding'
import { launchWritingAgent } from './research-writing-agent-session'
import { readManuscriptSource, resolveManuscriptFile } from './research-writing-source'
import { researchHarnessBridge } from './use-research-harness-experiment'

type WorkspaceOwner = Pick<ExperimentRecord, 'hostId' | 'workspaceId' | 'workspacePath'>

/**
 * Writes the Run's current value into the claim's line of the .tex, then re-records the claim so the
 * audit agrees. Resolves to an error message, or null once the paper says the new number.
 */
export async function updateClaimText(
  owner: WorkspaceOwner,
  claim: ResearchClaimAudit
): Promise<string | null> {
  const update = claimTextUpdate(claim)
  if (!update || owner.hostId !== 'local') {
    return 'This claim has no Run value to write into the paper.'
  }
  try {
    const file = resolveManuscriptFile(owner, update.file, '.tex')
    const state = useAppStore.getState()
    if (
      state.openFiles.some(
        (open) =>
          open.worktreeId === owner.workspaceId &&
          open.filePath === file.absolutePath &&
          (isEditorModelDirty(state, open) || Boolean(open.externalMutation))
      )
    ) {
      return `Save your edits to ${file.relativePath} first.`
    }
    const source = await readManuscriptSource(owner, file)
    const next = applyClaimTextUpdate(source.text, update)
    if (next === null) {
      return `Line ${update.line} of ${file.relativePath} no longer states this number. Open it to edit by hand.`
    }
    const written = await writeRuntimeFile(
      {
        target: { kind: 'local' },
        worktreeId: owner.workspaceId,
        worktreePath: owner.workspacePath
      },
      file.absolutePath,
      next,
      { kind: 'research-workspace', workspacePath: owner.workspacePath },
      { expectedSignature: getDiskBaselineSignature(source.text) }
    )
    if (!written.ok) {
      return `${file.relativePath} changed while updating. Re-check and try again.`
    }
    // Why: the Writing editor reloads the file from disk instead of keeping the old number.
    notifyEditorExternalFileChange({
      worktreeId: owner.workspaceId,
      worktreePath: owner.workspacePath,
      relativePath: file.relativePath,
      runtimeEnvironmentId: null
    })
    const refresh = researchHarnessBridge().claimsRefresh
    if (refresh) {
      await refresh({ workspacePath: owner.workspacePath, claim: claim.id })
    }
    return null
  } catch (cause) {
    return researchErrorText(cause)
  }
}

/**
 * Hands the claim's line to the project's Writing chat as a guarded edit request, starting a chat
 * when none is bound. Resolves to an error message, or null once the request is delivered.
 */
export async function askWritingAgentAboutClaim(
  record: ExperimentRecord,
  claim: ResearchClaimAudit
): Promise<string | null> {
  const location = claim.location
  if (!location?.line) {
    return 'This claim has no line in the paper.'
  }
  try {
    const file = resolveManuscriptFile(record, location.file, '.tex')
    const text = (await readManuscriptSource(record, file)).text
      .split('\n')
      [location.line - 1]?.replace(/\r$/, '')
    if (text === undefined) {
      return `${file.relativePath} is shorter than line ${location.line}.`
    }
    const selection = {
      filePath: file.absolutePath,
      relativePath: file.relativePath,
      startLine: location.line,
      startColumn: 1,
      endLine: location.line,
      endColumn: text.length + 1,
      selectedText: text
    }
    const instruction = [
      `This line states a claim the Aster claims check marks as a mismatch: ${claimProblemText(claim) ?? claim.text}`,
      `Evidence: ${claim.evidence.map(claimEvidenceText).join('; ') || 'none recorded'}.`,
      'Make the sentence agree with the current Run value, adjusting any wording that depends on the number.'
    ].join(' ')
    const state = useAppStore.getState()
    const sessionId = record.writingAgentSessionId
    const tab = (state.unifiedTabsByWorktree[record.workspaceId] ?? []).find(
      (candidate) => candidate.entityId === sessionId
    )
    const check = validateWritingAgentBinding({
      experiment: record,
      boundSessionId: sessionId,
      currentWorkspaceId: record.workspaceId,
      currentHostId: record.hostId,
      tab,
      tabOwnerHostId: tab ? structuredAgentSessionOwnerForTab(state, tab) : null
    })
    if (!check.ok) {
      return await launchWritingAgent(
        record,
        reviewChatAgent(),
        buildWritingAgentFileEditPrompt(selection, instruction)
      )
    }
    const result = await sendWritingAgentRevision({
      worktreeId: record.workspaceId,
      binding: check.binding,
      selection,
      instruction
    })
    return result.status === 'sent'
      ? null
      : result.status === 'invalid'
        ? result.reason
        : 'The Writing chat did not confirm the request. Check the chat before retrying.'
  } catch (cause) {
    return researchErrorText(cause)
  }
}
