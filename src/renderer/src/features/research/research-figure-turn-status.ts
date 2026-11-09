import {
  FIGURE_TURN_ACTIVE,
  updateFigureTurn,
  useFigureTurn,
  type FigureTurn
} from './research-figure-turn'
import type { FiguresAgentScope } from './research-figures-agent-session'

export type FigureAgentStatus = {
  status: 'working' | 'attention' | 'idle' | null
  toolName?: string
  toolInput?: string
  turnOutcome?: string
}

function toolPhase(name: string, input: string): 'drawing' | 'checking' | 'reading' {
  if (/figures\s+(preview|check|lint)\b/.test(input)) {
    return 'checking'
  }
  if (/^(Bash|Write|Edit|MultiEdit|NotebookEdit|apply_patch|shell)$/i.test(name)) {
    return /\.(excalidraw|figure\.mjs|mjs|py)\b|node\b|python/.test(input) || name !== 'Bash'
      ? 'drawing'
      : 'reading'
  }
  return 'reading'
}

function turnOfSession(sessionId: string): FigureTurn | null {
  const entries = Object.values(useFigureTurn.getState().figures)
  return (
    entries.find(({ turn }) => turn.sessionId === sessionId && FIGURE_TURN_ACTIVE.has(turn.phase))
      ?.turn ?? null
  )
}

function noteSessionWorking(sessionId: string, working: boolean): void {
  useFigureTurn.setState((state) => {
    if (Boolean(state.workingSessions[sessionId]) === working) {
      return state
    }
    if (working) {
      return { workingSessions: { ...state.workingSessions, [sessionId]: true } }
    }
    const { [sessionId]: _stopped, ...others } = state.workingSessions
    return { workingSessions: others }
  })
}

/** Follows one Figure chat's status: tool calls move its turn's phase, the turn's end settles it. */
export function noteFigureAgentStatus(sessionId: string, status: FigureAgentStatus): void {
  noteSessionWorking(sessionId, status.status === 'working')
  const turn = turnOfSession(sessionId)
  if (!turn) {
    return
  }
  if (status.status === 'working') {
    const key = status.toolName ? `${status.toolName}|${status.toolInput ?? ''}` : null
    if (!key || key === turn.lastTool) {
      updateFigureTurn(turn.id, {
        sawWorking: true,
        phase: turn.phase === 'sending' || turn.phase === 'waiting' ? 'reading' : turn.phase
      })
      return
    }
    const next = toolPhase(status.toolName ?? '', status.toolInput ?? '')
    // Why: reading the preview PNG is part of checking it, and a read after drawing is a check too.
    const phase = next === 'reading' && turn.round > 0 ? turn.phase : next
    updateFigureTurn(turn.id, {
      sawWorking: true,
      lastTool: key,
      phase,
      round: phase === 'drawing' && turn.phase !== 'drawing' ? turn.round + 1 : turn.round,
      checks: phase === 'checking' && turn.phase !== 'checking' ? turn.checks + 1 : turn.checks
    })
    return
  }
  if (status.status === 'attention') {
    updateFigureTurn(turn.id, { phase: 'waiting', sawWorking: true })
    return
  }
  if (status.status === 'idle' && turn.sawWorking) {
    const stopped =
      status.turnOutcome === 'cancellation' ||
      status.turnOutcome === 'interruption' ||
      status.turnOutcome === 'failure'
    updateFigureTurn(turn.id, { phase: stopped ? 'stopped' : 'done' })
  }
}

/** Whether this Figure chat is running a turn now. */
export function figureSessionWorking(sessionId: string): boolean {
  return Boolean(useFigureTurn.getState().workingSessions[sessionId])
}

/** The chats of this project whose tracked turn is still running. */
export function activeFigureTurnSessions(
  state: ReturnType<typeof useFigureTurn.getState>,
  scope: FiguresAgentScope
): string[] {
  return Object.values(state.figures)
    .flatMap(({ turn }) =>
      turn.sessionId !== null &&
      FIGURE_TURN_ACTIVE.has(turn.phase) &&
      turn.scope.workspaceId === scope.workspaceId &&
      turn.scope.hostId === scope.hostId
        ? [turn.sessionId]
        : []
    )
    .sort()
}
