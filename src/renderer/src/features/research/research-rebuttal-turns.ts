import { create } from 'zustand'

/** Who is working: the author-side agent, or the simulated agent of one reviewer. */
export type RebuttalActor = 'author' | `reviewer:${string}`

export type RebuttalTurnPhase = 'sending' | 'working' | 'waiting' | 'done' | 'stopped' | 'failed'

export type RebuttalTurn = {
  id: string
  actor: RebuttalActor
  /** What was asked, in plain words. */
  request: string
  /** The reply slots the request is about; empty when it is about the whole rebuttal. */
  slots: readonly string[]
  phase: RebuttalTurnPhase
  sawWorking: boolean
  error: string | null
}

export type RebuttalAgentStatus = {
  status: 'working' | 'attention' | 'idle' | null
  turnOutcome?: string
}

type TurnState = {
  /** The latest tracked turn of each actor, keyed by actor. */
  turns: Record<string, RebuttalTurn>
  /** Whether an actor's chat is running a turn (tracked or typed in the chat). */
  working: Record<string, boolean>
}

export const useRebuttalTurns = create<TurnState>(() => ({ turns: {}, working: {} }))

let nextTurnNumber = 1

/** A turn ID an agent passes back with its writes, unique within this app run. */
export function newRebuttalTurnId(): string {
  return `t${Date.now().toString(36)}${nextTurnNumber++}`
}

export const REBUTTAL_TURN_ACTIVE: ReadonlySet<RebuttalTurnPhase> = new Set([
  'sending',
  'working',
  'waiting'
])

function setTurn(actor: string, patch: Partial<RebuttalTurn>): void {
  useRebuttalTurns.setState((state) => {
    const current = state.turns[actor]
    return current ? { turns: { ...state.turns, [actor]: { ...current, ...patch } } } : state
  })
}

export function beginRebuttalTurn(input: {
  id: string
  actor: RebuttalActor
  request: string
  slots: readonly string[]
}): void {
  useRebuttalTurns.setState((state) => ({
    turns: {
      ...state.turns,
      [input.actor]: {
        id: input.id,
        actor: input.actor,
        request: input.request.replace(/\s+/g, ' ').trim(),
        slots: input.slots,
        phase: 'sending',
        sawWorking: false,
        error: null
      }
    }
  }))
}

export function failRebuttalTurn(actor: RebuttalActor, error: string): void {
  setTurn(actor, { phase: 'failed', error })
}

/** Follows one chat's status: work moves the phase, and the turn's end settles it once. */
export function noteRebuttalAgentStatus(actor: string, status: RebuttalAgentStatus): void {
  const { working, turns } = useRebuttalTurns.getState()
  const isWorking = status.status === 'working'
  if (Boolean(working[actor]) !== isWorking) {
    useRebuttalTurns.setState((state) => ({ working: { ...state.working, [actor]: isWorking } }))
  }
  const turn = turns[actor]
  if (!turn || !REBUTTAL_TURN_ACTIVE.has(turn.phase)) {
    return
  }
  if (status.status === 'working') {
    setTurn(actor, { phase: 'working', sawWorking: true })
    return
  }
  if (status.status === 'attention') {
    setTurn(actor, { phase: 'waiting', sawWorking: true })
    return
  }
  if (status.status === 'idle' && turn.sawWorking) {
    const stopped =
      status.turnOutcome === 'cancellation' ||
      status.turnOutcome === 'interruption' ||
      status.turnOutcome === 'failure'
    setTurn(actor, { phase: stopped ? 'stopped' : 'done' })
  }
}

export function clearRebuttalTurn(actor: RebuttalActor, id: string): void {
  useRebuttalTurns.setState((state) => {
    if (state.turns[actor]?.id !== id) {
      return state
    }
    const turns = { ...state.turns }
    delete turns[actor]
    return { turns }
  })
}

export function rebuttalTurnPhaseText(turn: RebuttalTurn): string {
  switch (turn.phase) {
    case 'sending':
      return 'Sending…'
    case 'working':
      return 'Working…'
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

/** Whether the author-side agent is working on this reply now. */
export function useRebuttalSlotBusy(slot: string | null): boolean {
  return useRebuttalTurns((state) => {
    const turn = state.turns.author
    return Boolean(
      slot && turn && REBUTTAL_TURN_ACTIVE.has(turn.phase) && turn.slots.includes(slot)
    )
  })
}
