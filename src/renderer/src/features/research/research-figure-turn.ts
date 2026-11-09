import { create } from 'zustand'
import type { FigureElementDiff } from './research-figure-diff'
import { snapshotFigure } from './research-figure-history'
import type { FiguresAgentScope } from './research-figures-agent-session'
import type { FigureTarget } from './research-figures-export'
import { projectOwnerKey } from './research-project-files'

/** Where the Figure agent is in one request, as the canvas shows it. */
export type FigureTurnPhase =
  | 'sending'
  | 'reading'
  | 'drawing'
  | 'checking'
  | 'waiting'
  | 'done'
  | 'stopped'
  | 'failed'

export type FigureTurn = {
  id: number
  /** The figure the request is about; null when none was open. */
  target: FigureTarget | null
  /** What the person asked, as the turn bar names it. */
  request: string
  /** The prompt Retry sends again. */
  prompt: string
  scope: FiguresAgentScope
  startedAt: number
  /** The figure as it was just before the request ("before send"). */
  beforeText: string | null
  beforeId: string | null
  phase: FigureTurnPhase
  /** Drawing rounds and preview checks seen so far. */
  round: number
  checks: number
  sawWorking: boolean
  lastTool: string | null
  /** What the turn changed, once it ended and the canvas caught up. */
  diff: FigureElementDiff | null
  error: string | null
}

type TurnState = {
  turn: FigureTurn | null
  /** The turn bar was closed with ×. */
  barDismissed: boolean
  showChanges: boolean
  /** What the agent's latest write added or changed, flashed on the canvas for 1.5 s. */
  flash: { ids: string[]; at: number } | null
  /** The Figure chat is running a turn (tracked or not). */
  agentWorking: boolean
}

export const useFigureTurn = create<TurnState>(() => ({
  turn: null,
  barDismissed: false,
  showChanges: false,
  flash: null,
  agentWorking: false
}))

export const FIGURE_TURN_ACTIVE: ReadonlySet<FigureTurnPhase> = new Set([
  'sending',
  'reading',
  'drawing',
  'checking',
  'waiting'
])
// Why three: the Figure prompt asks the agent for at most three check-and-fix rounds.
export const FIGURE_TURN_MAX_CHECKS = 3

let nextTurnId = 1

export function sameFigureTarget(a: FigureTarget | null, b: FigureTarget | null): boolean {
  return Boolean(
    a &&
    b &&
    a.slug === b.slug &&
    a.folder === b.folder &&
    projectOwnerKey(a.owner) === projectOwnerKey(b.owner)
  )
}

function update(id: number, patch: Partial<FigureTurn>): void {
  useFigureTurn.setState((state) =>
    state.turn?.id === id ? { turn: { ...state.turn, ...patch } } : state
  )
}

/**
 * Starts tracking a request: keeps the figure's "before send" version in its History and shows
 * `Sending…` on the canvas. Returns the turn id.
 */
export function beginFigureTurn(input: {
  target: FigureTarget | null
  request: string
  prompt: string
  scope: FiguresAgentScope
  beforeText: string | null
}): number {
  const id = nextTurnId++
  useFigureTurn.setState({
    barDismissed: false,
    showChanges: false,
    turn: {
      id,
      target: input.target,
      request: input.request.replace(/\s+/g, ' ').trim(),
      prompt: input.prompt,
      scope: input.scope,
      startedAt: Date.now(),
      beforeText: input.beforeText,
      beforeId: null,
      phase: 'sending',
      round: 0,
      checks: 0,
      sawWorking: false,
      lastTool: null,
      diff: null,
      error: null
    }
  })
  if (input.target && input.beforeText) {
    void snapshotFigure(input.target, {
      kind: 'before-send',
      what: input.request,
      text: input.beforeText
    }).then((entry) => entry && update(id, { beforeId: entry.id }))
  }
  return id
}

/** The request never reached the agent. */
export function failFigureTurn(id: number, error: string): void {
  update(id, { phase: 'failed', error })
}

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

/** Follows the Figure chat's status: tool calls move the phase, the turn's end settles it. */
export function noteFigureAgentStatus(status: FigureAgentStatus): void {
  const working = status.status === 'working'
  if (useFigureTurn.getState().agentWorking !== working) {
    useFigureTurn.setState({ agentWorking: working })
  }
  const turn = useFigureTurn.getState().turn
  if (!turn || !FIGURE_TURN_ACTIVE.has(turn.phase)) {
    return
  }
  if (status.status === 'working') {
    const key = status.toolName ? `${status.toolName}|${status.toolInput ?? ''}` : null
    if (!key || key === turn.lastTool) {
      update(turn.id, {
        sawWorking: true,
        phase: turn.phase === 'sending' || turn.phase === 'waiting' ? 'reading' : turn.phase
      })
      return
    }
    const next = toolPhase(status.toolName ?? '', status.toolInput ?? '')
    // Why: reading the preview PNG is part of checking it, and a read after drawing is a check too.
    const phase = next === 'reading' && turn.round > 0 ? turn.phase : next
    update(turn.id, {
      sawWorking: true,
      lastTool: key,
      phase,
      round: phase === 'drawing' && turn.phase !== 'drawing' ? turn.round + 1 : turn.round,
      checks: phase === 'checking' && turn.phase !== 'checking' ? turn.checks + 1 : turn.checks
    })
    return
  }
  if (status.status === 'attention') {
    update(turn.id, { phase: 'waiting', sawWorking: true })
    return
  }
  if (status.status === 'idle' && turn.sawWorking) {
    const stopped =
      status.turnOutcome === 'cancellation' ||
      status.turnOutcome === 'interruption' ||
      status.turnOutcome === 'failure'
    update(turn.id, { phase: stopped ? 'stopped' : 'done' })
  }
}

/**
 * Whether a change to this figure's file comes from the agent's tracked turn: while it works, and
 * after it ends until the canvas has caught up with its last write.
 */
export function figureAgentWriting(target: FigureTarget): boolean {
  const { turn } = useFigureTurn.getState()
  if (!turn || !sameFigureTarget(turn.target, target)) {
    return false
  }
  return (
    FIGURE_TURN_ACTIVE.has(turn.phase) ||
    (turn.diff === null && (turn.phase === 'done' || turn.phase === 'stopped'))
  )
}

/** The figure as it was when the tracked turn on it began, or null. */
export function figureTurnBeforeText(target: FigureTarget): string | null {
  const { turn } = useFigureTurn.getState()
  return turn && sameFigureTarget(turn.target, target) ? turn.beforeText : null
}

export function noteFigureAgentWrite(ids: readonly string[]): void {
  if (ids.length) {
    useFigureTurn.setState({ flash: { ids: [...ids], at: Date.now() } })
  }
}

export function setFigureTurnDiff(id: number, diff: FigureElementDiff): void {
  update(id, { diff })
}

export function dismissFigureTurnBar(): void {
  useFigureTurn.setState({ barDismissed: true, showChanges: false })
}

export function setFigureTurnChangesShown(showChanges: boolean): void {
  useFigureTurn.setState({ showChanges })
}

/** Whether the Figure agent is working on this figure now (for the figure list's marker). */
export function useFigureAgentEditing(slug: string): boolean {
  return useFigureTurn(
    (state) =>
      state.turn !== null &&
      state.turn.target?.slug === slug &&
      FIGURE_TURN_ACTIVE.has(state.turn.phase)
  )
}

/** The canvas chip's words for a phase. */
export function figureTurnPhaseText(turn: FigureTurn): string {
  switch (turn.phase) {
    case 'sending':
      return 'Sending…'
    case 'reading':
      return 'Reading…'
    case 'drawing':
      return `Drawing · round ${Math.max(1, turn.round)}`
    case 'checking':
      return `Checking the preview · round ${Math.max(1, turn.checks)}/${FIGURE_TURN_MAX_CHECKS}`
    case 'waiting':
      return 'Waiting for you in the chat'
    case 'done':
      return 'Done'
    case 'stopped':
      return 'Stopped'
    case 'failed':
      return turn.error ? `Not sent · ${turn.error}` : 'Not sent'
  }
}
