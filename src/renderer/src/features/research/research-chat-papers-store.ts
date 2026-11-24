import { z } from 'zod'
import { create } from 'zustand'
import type { LibraryPaperDraft } from './research-library-paper-records'

/** A paper a chat named that the project's Library lacks, waiting for the person or the setting. */
export type ChatPaperCandidate = {
  key: string
  draft: LibraryPaperDraft
  messageId: string | null
  /** Set when an agent asked with the harness `library add`. */
  request?: { id: string; agent: string | null; note: string | null; sessionId: string | null }
}

export type ChatPaperEntry =
  | { state: 'pending'; at: number; candidate: ChatPaperCandidate }
  | { state: 'added'; at: number; paperIds: string[] }
  /** dismissed: Not now; present: already in the Library; skipped: no confident match. */
  | { state: 'dismissed' | 'present' | 'skipped'; at: number }

type ChatRecord = {
  /** Messages older than this were in the chat before Aster started watching it. */
  since: number
  touchedAt: number
  papers: Record<string, ChatPaperEntry>
}

type Persisted = { v: 1; chats: Record<string, ChatRecord>; requests: Record<string, number> }

export type ChatPaperNotice = { id: number; paperIds: string[]; titles: string[]; keys: string[] }

type ChatPapersState = Persisted & {
  /** "Added automatically" notices, per chat; this window only. */
  notices: Record<string, ChatPaperNotice | undefined>
}

const STORAGE_KEY = 'aster.library.chatPapers.v1'
const MAX_CHATS = 100
const MAX_ENTRIES_PER_CHAT = 200
const MAX_REQUESTS = 500
/** A chat first seen now still counts what it said in the last minutes, e.g. before a reload. */
const FIRST_SEEN_LOOKBACK_MS = 10 * 60_000

function emptyPersisted(): Persisted {
  return { v: 1, chats: {}, requests: {} }
}

const draftSchema = z.object({
  title: z.string(),
  tags: z.array(z.string()),
  authors: z.string().optional(),
  year: z.number().optional(),
  venue: z.string().optional(),
  abstract: z.string().optional(),
  arxivId: z.string().optional(),
  doi: z.string().optional(),
  externalUrl: z.string().optional()
})

const entrySchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('pending'),
    at: z.number(),
    candidate: z.object({
      key: z.string(),
      draft: draftSchema,
      messageId: z.string().nullable(),
      request: z
        .object({
          id: z.string(),
          agent: z.string().nullable(),
          note: z.string().nullable(),
          sessionId: z.string().nullable()
        })
        .optional()
    })
  }),
  z.object({ state: z.literal('added'), at: z.number(), paperIds: z.array(z.string()) }),
  z.object({ state: z.enum(['dismissed', 'present', 'skipped']), at: z.number() })
])

const persistedSchema = z.object({
  v: z.literal(1),
  chats: z.record(
    z.string(),
    z.object({
      since: z.number(),
      touchedAt: z.number(),
      papers: z.record(z.string(), entrySchema)
    })
  ),
  requests: z.record(z.string(), z.number())
})

function readPersisted(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = persistedSchema.safeParse(raw ? JSON.parse(raw) : null)
    if (parsed.success) {
      return parsed.data
    }
  } catch {
    // A damaged record starts over; at worst a paper is offered again.
  }
  return emptyPersisted()
}

function newest<T>(entries: [string, T][], at: (value: T) => number, keep: number): [string, T][] {
  return entries.length <= keep
    ? entries
    : [...entries].sort((left, right) => at(right[1]) - at(left[1])).slice(0, keep)
}

function pruned(state: Persisted): Persisted {
  const chats = newest(Object.entries(state.chats), (chat) => chat.touchedAt, MAX_CHATS).map(
    ([key, chat]): [string, ChatRecord] => [
      key,
      {
        ...chat,
        papers: Object.fromEntries(
          newest(Object.entries(chat.papers), (entry) => entry.at, MAX_ENTRIES_PER_CHAT)
        )
      }
    ]
  )
  return {
    v: 1,
    chats: Object.fromEntries(chats),
    requests: Object.fromEntries(newest(Object.entries(state.requests), (at) => at, MAX_REQUESTS))
  }
}

export const useChatPapers = create<ChatPapersState>(() => ({ ...readPersisted(), notices: {} }))

function persist(change: (state: Persisted) => Persisted): void {
  const current = useChatPapers.getState()
  // Why read back first: a project side or window saves its own chats under the same key, and a
  // write from this window's copy alone would drop what it saved since.
  const stored = readPersisted()
  const next = pruned(
    change({
      v: 1,
      chats: { ...current.chats, ...stored.chats },
      requests: { ...current.requests, ...stored.requests }
    })
  )
  useChatPapers.setState(next)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Kept for this window; another window may offer the paper again.
  }
}

let followingOtherWindows = false

/** Another window's decision lands here too, so a paper is not offered twice. */
export function followChatPapersFromOtherWindows(): void {
  if (followingOtherWindows) {
    return
  }
  followingOtherWindows = true
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      useChatPapers.setState(readPersisted())
    }
  })
}

/** The chat's record, started now for a chat Aster has not watched before. */
export function ensureChatRecord(chatKey: string, now = Date.now()): ChatRecord {
  const existing = useChatPapers.getState().chats[chatKey]
  if (existing) {
    return existing
  }
  const record: ChatRecord = { since: now - FIRST_SEEN_LOOKBACK_MS, touchedAt: now, papers: {} }
  persist((state) => ({ ...state, chats: { ...state.chats, [chatKey]: record } }))
  return record
}

export function setChatPaperEntries(
  chatKey: string,
  entries: Record<string, ChatPaperEntry>,
  now = Date.now()
): void {
  persist((state) => {
    const chat = state.chats[chatKey] ?? {
      since: now - FIRST_SEEN_LOOKBACK_MS,
      touchedAt: now,
      papers: {}
    }
    return {
      ...state,
      chats: {
        ...state.chats,
        [chatKey]: { ...chat, touchedAt: now, papers: { ...chat.papers, ...entries } }
      }
    }
  })
}

export function markLibraryRequestsHandled(ids: readonly string[], now = Date.now()): void {
  if (ids.length) {
    persist((state) => ({
      ...state,
      requests: { ...state.requests, ...Object.fromEntries(ids.map((id) => [id, now])) }
    }))
  }
}

export function pendingChatPapers(chat: ChatRecord | undefined): ChatPaperCandidate[] {
  return Object.values(chat?.papers ?? {})
    .flatMap((entry) =>
      entry.state === 'pending' ? [{ at: entry.at, candidate: entry.candidate }] : []
    )
    .sort((left, right) => left.at - right.at)
    .map((entry) => entry.candidate)
}

let noticeSequence = 0

export function showChatPaperNotice(
  chatKey: string,
  notice: Omit<ChatPaperNotice, 'id'> | null
): void {
  noticeSequence += 1
  useChatPapers.setState((state) => ({
    notices: { ...state.notices, [chatKey]: notice ? { ...notice, id: noticeSequence } : undefined }
  }))
}
