import { requestFiguresAgentFocus } from './research-figures-agent-session'
import { openResearchView } from './research-navigation'
import { requestRebuttalAgentFocus } from './research-rebuttal-agent-session'

/** Opens the page a Rebuttal or Figure chat lives on, with its agent pane showing. */
export function openProjectAgentPage(
  kind: 'rebuttal' | 'figures',
  scope: { hostId: string; workspaceId: string }
): void {
  if (kind === 'rebuttal') {
    requestRebuttalAgentFocus(scope)
    openResearchView('research-rebuttal')
  } else {
    requestFiguresAgentFocus(scope)
    openResearchView('research-figures')
  }
}
