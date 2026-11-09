import { create } from 'zustand'
import type { FigureElementDiff } from './research-figure-diff'
import { useFigureEditorHandle } from './research-figure-editor-handle'
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
  /** The chat doing it; null until the send has it (a new chat is still starting). */
  sessionId: string | null
  /** The figure the request is about. */
  target: FigureTarget
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

/** One figure's latest agent turn and what the canvas shows about it. */
export type FigureTurnEntry = {
  turn: FigureTurn
  /** The turn bar was closed with ×. */
  barDismissed: boolean
  showChanges: boolean
  /** What the agent's latest write added or changed, flashed on the canvas for 1.5 s. */
  flash: { ids: string[]; at: number } | null
  /** The file when its figure opened during the turn: what the agent's next write builds on. */
  openedAt: string | null
}

type TurnState = {
  /** Each figure's latest turn, by `figureTurnKey`; agents on different figures run side by side. */
  figures: Readonly<Record<string, FigureTurnEntry>>
  /** The Figure chats running a turn now (tracked or not). */
  workingSessions: Readonly<Record<string, true>>
}

export const useFigureTurn = create<TurnState>(() => ({
  figures: {},
  workingSessions: {}
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

export function figureTurnKey(target: {
  owner: Pick<FigureTarget['owner'], 'hostId' | 'workspaceId'>
  slug: string
}): string {
  return JSON.stringify([target.owner.hostId, target.owner.workspaceId, target.slug])
}

function patchEntry(key: string, patch: Partial<FigureTurnEntry>): void {
  useFigureTurn.setState((state) => {
    const entry = state.figures[key]
    return entry ? { figures: { ...state.figures, [key]: { ...entry, ...patch } } } : state
  })
}

export function updateFigureTurn(id: number, patch: Partial<FigureTurn>): void {
  useFigureTurn.setState((state) => {
    const found = Object.entries(state.figures).find(([, entry]) => entry.turn.id === id)
    if (!found) {
      return state
    }
    const [key, entry] = found
    return {
      figures: { ...state.figures, [key]: { ...entry, turn: { ...entry.turn, ...patch } } }
    }
  })
}

/**
 * Starts tracking a request on its figure: keeps the figure's "before send" version in its History
 * and shows `Sending…` on that figure. Without a figure (a plot) nothing is tracked. Returns the
 * turn id.
 */
export function beginFigureTurn(input: {
  target: FigureTarget | null
  request: string
  prompt: string
  scope: FiguresAgentScope
  beforeText: string | null
  sessionId?: string | null
}): number {
  const id = nextTurnId++
  const { target } = input
  if (!target) {
    return id
  }
  useFigureTurn.setState((state) => ({
    figures: {
      ...state.figures,
      [figureTurnKey(target)]: {
        barDismissed: false,
        showChanges: false,
        flash: null,
        openedAt: null,
        turn: {
          id,
          sessionId: input.sessionId ?? null,
          target,
          request: input.request.replace(/\s+/g, ' ').trim(),
          prompt: input.prompt,
          scope: input.scope,
          startedAt: Date.now(),
          beforeText: input.beforeText,
          beforeId: null,
          phase: 'sending',
          round: 0,
          checks: 0,
          // Why: a typed message's turn starts after the send, so its chat may already be working;
          // that chat's next idle must end this turn rather than leave it Sending… for good.
          sawWorking: Boolean(input.sessionId && state.workingSessions[input.sessionId]),
          lastTool: null,
          diff: null,
          error: null
        }
      }
    }
  }))
  if (input.beforeText) {
    void snapshotFigure(target, {
      kind: 'before-send',
      what: input.request,
      text: input.beforeText
    }).then((entry) => entry && updateFigureTurn(id, { beforeId: entry.id }))
  }
  return id
}

/** Names the chat a turn runs in, once the send knows it. */
export function attachFigureTurnSession(id: number, sessionId: string): void {
  // Why: the chat can report that it is working before the send learns which chat it is.
  const working = Boolean(useFigureTurn.getState().workingSessions[sessionId])
  updateFigureTurn(id, working ? { sessionId, sawWorking: true } : { sessionId })
}

/** The request never reached the agent. */
export function failFigureTurn(id: number, error: string): void {
  updateFigureTurn(id, { phase: 'failed', error })
}

/** The figure's turn entry, when its latest turn is about exactly this figure. */
function figureEntry(state: TurnState, target: FigureTarget): FigureTurnEntry | null {
  const entry = state.figures[figureTurnKey(target)]
  return entry && sameFigureTarget(entry.turn.target, target) ? entry : null
}

/** The figure's latest turn and what the canvas shows about it, or null. */
export function useFigureTurnEntry(target: FigureTarget): FigureTurnEntry | null {
  return useFigureTurn((state) => figureEntry(state, target))
}

export function figureTurnEntry(target: FigureTarget): FigureTurnEntry | null {
  return figureEntry(useFigureTurn.getState(), target)
}

/**
 * Whether a change to this figure's file comes from the agent's tracked turn: while it works, and
 * after it ends until the canvas has caught up with its last write.
 */
export function figureAgentWriting(target: FigureTarget): boolean {
  const turn = figureTurnEntry(target)?.turn
  if (!turn) {
    return false
  }
  return (
    FIGURE_TURN_ACTIVE.has(turn.phase) ||
    (turn.diff === null && (turn.phase === 'done' || turn.phase === 'stopped'))
  )
}

/**
 * What the agent's next write builds on: the figure when its tracked turn began, or the file when
 * the figure was opened during the turn (see `noteFigureOpenedDuringTurn`). Null without a turn.
 */
export function figureTurnBeforeText(target: FigureTarget): string | null {
  const entry = figureTurnEntry(target)
  return entry ? (entry.openedAt ?? entry.turn.beforeText) : null
}

/**
 * A figure opened while its agent works: the agent's next write builds on the file as it is now.
 * Merging that write from the older "before send" text would flag the agent's own edits as conflicts.
 */
export function noteFigureOpenedDuringTurn(target: FigureTarget, text: string): void {
  if (figureAgentWriting(target)) {
    patchEntry(figureTurnKey(target), { openedAt: text })
  }
}

/** What the open figure's latest agent write changed, flashed on its canvas. */
export function noteFigureAgentWrite(ids: readonly string[]): void {
  const target = useFigureEditorHandle.getState().handle?.target
  if (ids.length && target) {
    patchEntry(figureTurnKey(target), { flash: { ids: [...ids], at: Date.now() } })
  }
}

export function setFigureTurnDiff(id: number, diff: FigureElementDiff): void {
  updateFigureTurn(id, { diff })
}

export function dismissFigureTurnBar(target: FigureTarget): void {
  patchEntry(figureTurnKey(target), { barDismissed: true, showChanges: false })
}

export function setFigureTurnChangesShown(target: FigureTarget, showChanges: boolean): void {
  patchEntry(figureTurnKey(target), { showChanges })
}

/** A renamed figure keeps its running or finished turn. */
export function moveFigureTurn(target: FigureTarget, toSlug: string): void {
  useFigureTurn.setState((state) => {
    const key = figureTurnKey(target)
    const entry = state.figures[key]
    if (!entry || target.slug === toSlug) {
      return state
    }
    const { [key]: _moved, ...others } = state.figures
    const moved = { ...entry.turn.target, slug: toSlug }
    return {
      figures: {
        ...others,
        [figureTurnKey(moved)]: { ...entry, turn: { ...entry.turn, target: moved } }
      }
    }
  })
}

/** A deleted figure has no turn to show any more. */
export function forgetFigureTurn(target: FigureTarget): void {
  useFigureTurn.setState((state) => {
    const { [figureTurnKey(target)]: _gone, ...others } = state.figures
    return Object.keys(others).length === Object.keys(state.figures).length
      ? state
      : { figures: others }
  })
}

/** Whether the Figure agent is working on this figure now (for the figure list's marker). */
export function useFigureAgentEditing(
  owner: Pick<FigureTarget['owner'], 'hostId' | 'workspaceId'>,
  slug: string
): boolean {
  const key = figureTurnKey({ owner, slug })
  return useFigureTurn((state) => {
    const phase = state.figures[key]?.turn.phase
    return phase !== undefined && FIGURE_TURN_ACTIVE.has(phase)
  })
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
