import type {
  ResearchWindowAction,
  ResearchWindowActionResult
} from '../../../../shared/research-window-actions'
import { runResearchBackgroundAgent } from './research-background-agent-launch'
import { closeChatTabHere, renameChatTabHere } from './research-window-tab-actions'
import { openManuscriptInEditor } from './research-writing-open-editor'

/** Main window: does what a research window asked of the tabs, which this window owns. */
export async function runResearchWindowAction(
  action: ResearchWindowAction
): Promise<ResearchWindowActionResult> {
  switch (action.kind) {
    case 'launch-background-agent':
      return runResearchBackgroundAgent(action.launch, action.delegation)
    case 'close-chat':
      return closeChatTabHere({
        id: action.tabId,
        entityId: action.entityId,
        worktreeId: action.workspaceId
      })
        ? { ok: true }
        : { ok: false, error: 'The chat is no longer open in the main window.' }
    case 'rename-chat':
      renameChatTabHere(action.tabId, action.label)
      return { ok: true }
    case 'open-in-editor': {
      const error = openManuscriptInEditor(
        { workspaceId: action.workspaceId, hostId: action.hostId },
        action.file,
        action.besidePdf ?? null
      )
      return error ? { ok: false, error } : { ok: true }
    }
  }
}
