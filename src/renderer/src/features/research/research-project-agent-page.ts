import { requestFiguresAgentFocus, showFigureOfChat } from './research-figures-agent-session'
import { openResearchView } from './research-navigation'
import { requestRebuttalAgentFocus } from './research-rebuttal-agent-session'

/** Opens the page a Rebuttal or Figure chat lives on, with its agent pane showing. */
export function openProjectAgentPage(
  kind: 'rebuttal' | 'figures',
  scope: { hostId: string; workspaceId: string },
  /** The Figure chat to open: the page goes to the figure that holds it. */
  sessionId?: string
): void {
  if (kind === 'rebuttal') {
    requestRebuttalAgentFocus(scope)
    openResearchView('research-rebuttal')
  } else {
    if (sessionId) {
      showFigureOfChat(scope, sessionId)
    }
    requestFiguresAgentFocus(scope)
    openResearchView('research-figures')
  }
}
