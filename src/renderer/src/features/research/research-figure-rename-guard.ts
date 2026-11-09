import { figureAgentSessionId } from './research-figure-chat-slots'
import { FIGURE_TURN_ACTIVE, figureTurnKey, useFigureTurn } from './research-figure-turn'
import type { ProjectFileOwner } from './research-project-files'
import { useResearchRecords } from './research-records-store'

/** What the figure's Rename item says while its agent works. */
export const FIGURE_RENAME_BLOCKED_LABEL = "Can't rename while the agent works"

/** What the Rename dialog says when the agent started while it was open. */
export const FIGURE_RENAME_BLOCKED_MESSAGE =
  'The agent is working on this figure and would keep writing to the old file. Rename it when the agent finishes.'

/** What the Move item says while the figure's agent works: moving it strands the agent the same way. */
export const FIGURE_MOVE_BLOCKED_LABEL = "Can't move while the agent works"

/** What a move says when the agent started just before it was chosen. */
export const FIGURE_MOVE_BLOCKED_MESSAGE =
  'The agent is working on this figure and would keep writing to the old file. Move it when the agent finishes.'

type Turns = ReturnType<typeof useFigureTurn.getState>
type Owner = Pick<ProjectFileOwner, 'hostId' | 'workspaceId'>

// Why the chat as well as the turn: turns live in this window's memory, so a turn started before a
// reload or in another window shows only as the figure's own chat working.
function agentBusy(turns: Turns, owner: Owner, slug: string, chat: string | undefined): boolean {
  const phase = turns.figures[figureTurnKey({ owner, slug })]?.turn.phase
  return (
    (phase !== undefined && FIGURE_TURN_ACTIVE.has(phase)) ||
    Boolean(chat && turns.workingSessions[chat])
  )
}

/**
 * Whether this figure must keep its name for now. The agent writes to the path it was given, so a
 * rename during its turn would leave it writing to the old file.
 */
export function figureRenameBlocked(owner: Owner, slug: string): boolean {
  const chat = figureAgentSessionId(useResearchRecords.getState().document, owner, slug)
  return agentBusy(useFigureTurn.getState(), owner, slug, chat)
}

export function useFigureRenameBlocked(owner: Owner, slug: string): boolean {
  const chat = useResearchRecords((state) => figureAgentSessionId(state.document, owner, slug))
  return useFigureTurn((turns) => agentBusy(turns, owner, slug, chat))
}
