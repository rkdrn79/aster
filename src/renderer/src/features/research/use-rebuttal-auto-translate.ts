import { useEffect, useRef } from 'react'
import type { ReadingLanguageId } from './research-reading-language'
import { rebuttalAgentChatOpen, type RebuttalAgentScope } from './research-rebuttal-agent-session'
import { rebuttalTypingQuiet } from './research-rebuttal-editing'
import type { RebuttalTranslationTodo } from './research-rebuttal-translation-view'
import { REBUTTAL_TURN_ACTIVE, useRebuttalTurns } from './research-rebuttal-turns'

// Asks the Rebuttal agent to translate what is missing or outdated, on its own, without being
// noisy: one batched request at a time, only into a chat that is already open, only while the
// agent is idle and nobody has typed for 15 seconds, never for the same text twice, and at most
// once every 90 seconds. The agent translates its own replies in the same turn, so this mostly
// catches concerns after a split and replies the person edited.

const TICK_MS = 3000
/** How long without typing counts as "stopped editing". */
export const AUTO_TRANSLATE_QUIET_MS = 15_000
export const AUTO_TRANSLATE_GAP_MS = 90_000
const MAX_ASKED = 3000

export type AutoTranslateState = {
  todo: readonly RebuttalTranslationTodo[]
  asked: ReadonlySet<string>
  chatOpen: boolean
  /** The agent was idle at this tick and the one before, so a turn did not just end mid-write. */
  agentIdle: boolean
  typingQuiet: boolean
  readOnly: boolean
  sinceLastAsk: number
}

export function askedKey(item: Pick<RebuttalTranslationTodo, 'key' | 'hash'>): string {
  return `${item.key}@${item.hash}`
}

/** The items to ask for now, or null when this is not a good moment. */
export function autoTranslateBatch(state: AutoTranslateState): RebuttalTranslationTodo[] | null {
  if (
    state.readOnly ||
    !state.chatOpen ||
    !state.agentIdle ||
    !state.typingQuiet ||
    state.sinceLastAsk < AUTO_TRANSLATE_GAP_MS
  ) {
    return null
  }
  const fresh = state.todo.filter((item) => !state.asked.has(askedKey(item)))
  return fresh.length ? [...state.todo] : null
}

function storageKey(scope: RebuttalAgentScope, slug: string, language: string): string {
  return `aster.rebuttal.translateAsked.v1:${JSON.stringify([scope.hostId, scope.workspaceId, slug, language])}`
}

function readAsked(key: string): Set<string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]')
    return new Set(Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveAsked(key: string, asked: Set<string>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify([...asked].slice(-MAX_ASKED)))
  } catch {
    // Without storage, a later app run may ask again; that is harmless.
  }
}

function authorIdle(): boolean {
  const { turns, working } = useRebuttalTurns.getState()
  const turn = turns.author
  return !working.author && !(turn && REBUTTAL_TURN_ACTIVE.has(turn.phase))
}

const lastAskAt = new Map<string, number>()

/** Runs the automatic translation request for the open rebuttal; renders nothing. */
export function useRebuttalAutoTranslate(input: {
  scope: RebuttalAgentScope
  slug: string | null
  language: ReadingLanguageId
  todo: readonly RebuttalTranslationTodo[]
  readOnly: boolean
  /** Sends one translate request; resolves to an error message or null. */
  ask: (count: number) => Promise<string | null>
}): void {
  const latest = useRef(input)
  useEffect(() => {
    latest.current = input
  })
  const { slug, language } = input
  useEffect(() => {
    if (!slug || language === 'en') {
      return
    }
    let wasIdle = false
    let sending = false
    const timer = window.setInterval(() => {
      const current = latest.current
      const idle = authorIdle()
      const agentIdle = idle && wasIdle
      wasIdle = idle
      if (sending || !current.todo.length) {
        return
      }
      const key = storageKey(current.scope, slug, language)
      void rebuttalAgentChatOpen(current.scope).then((chatOpen) => {
        const asked = readAsked(key)
        const batch = autoTranslateBatch({
          todo: current.todo,
          asked,
          chatOpen,
          agentIdle,
          typingQuiet: rebuttalTypingQuiet(AUTO_TRANSLATE_QUIET_MS),
          readOnly: current.readOnly,
          sinceLastAsk: Date.now() - (lastAskAt.get(key) ?? 0)
        })
        if (!batch || sending) {
          return
        }
        sending = true
        lastAskAt.set(key, Date.now())
        for (const item of batch) {
          asked.add(askedKey(item))
        }
        saveAsked(key, asked)
        void current.ask(batch.length).finally(() => {
          sending = false
        })
      })
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [slug, language])
}
