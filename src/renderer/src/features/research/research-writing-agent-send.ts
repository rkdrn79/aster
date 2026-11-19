import type { ManuscriptSelection } from '@/components/editor/manuscript-selection-revision'
import { MAX_MANUSCRIPT_SELECTION_LENGTH } from '@/components/editor/manuscript-selection-revision'
import type { ActiveAgentNotesSendResult } from '@/lib/active-agent-note-send-result'
import { sendMessageToAgent } from '@/lib/agent-message-send'
import type { WritingAgentBinding } from './research-writing-agent-binding'
import { buildWritingAgentFileEditPrompt } from './research-writing-agent-prompts'

export { buildWritingAgentFileEditPrompt } from './research-writing-agent-prompts'

export type WritingRevisionSendResult =
  | { status: 'invalid'; reason: string }
  | ActiveAgentNotesSendResult

/** The explicit Send action dispatches to one bound chat; that agent edits the selected file. */
export async function sendWritingAgentRevision(input: {
  worktreeId: string
  binding: WritingAgentBinding
  selection: ManuscriptSelection
  instruction: string
  send?: typeof sendMessageToAgent
}): Promise<WritingRevisionSendResult> {
  if (
    !input.instruction.trim() ||
    !input.selection.selectedText.trim() ||
    input.selection.selectedText.length > MAX_MANUSCRIPT_SELECTION_LENGTH
  ) {
    return { status: 'invalid', reason: 'Add an instruction and select up to 24,000 characters.' }
  }
  return (input.send ?? sendMessageToAgent)({
    worktreeId: input.worktreeId,
    target: { kind: 'structured-session', sessionId: input.binding.sessionId },
    prompt: buildWritingAgentFileEditPrompt(input.selection, input.instruction)
  })
}
