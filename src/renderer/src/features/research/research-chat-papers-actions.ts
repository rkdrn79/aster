import { toast } from 'sonner'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import { resolveRuntimePath } from '../../../../shared/cross-platform-path'
import type { LibraryPaperOrigin, LibraryScope } from '../../../../shared/research/research-library'
import {
  findPaperMentionsInMessage,
  type PaperMention
} from '../../../../shared/research/research-library-mentions'
import { findLibraryPaperMatch } from '../../../../shared/research/research-library-paper-match'
import {
  LIBRARY_REQUEST_PATHS,
  mentionFromLibraryRequest,
  parseLibraryRequests,
  type LibraryRequest
} from '../../../../shared/research/research-library-requests'
import type { ChatPaperMode } from './research-chat-papers-mode'
import {
  markLibraryRequestsHandled,
  setChatPaperEntries,
  showChatPaperNotice,
  useChatPapers,
  type ChatPaperCandidate,
  type ChatPaperEntry,
  type ChatPaperNotice
} from './research-chat-papers-store'
import { addLibraryDrafts, removeLibraryPapers, resolvePaperMention } from './research-library-add'
import { readResearchTextFile, researchFileExists } from './research-file-reader'
import { useResearchLibrary } from './research-library-store'

export type ChatPaperContext = { scope: LibraryScope; chatKey: string; chatTitle: string | null }

export type FoundMention = {
  mention: PaperMention
  messageId: string | null
  request?: ChatPaperCandidate['request']
}

export type ScanCache = Map<string, { signature: string; mentions: PaperMention[] }>

function messageSignature(message: NativeChatMessage): string {
  let size = 0
  for (const block of message.blocks) {
    size +=
      block.type === 'text'
        ? block.text.length
        : block.type === 'tool-result'
          ? block.output.length
          : 1
  }
  return `${message.blocks.length}:${size}:${message.state ?? ''}`
}

/**
 * Mentions in messages written since Aster started watching this chat. A message still being
 * written waits, so a reply's papers arrive as one prompt.
 */
export function collectChatMentions(
  messages: readonly NativeChatMessage[],
  since: number,
  isWorking: boolean,
  cache: ScanCache
): FoundMention[] {
  const found: FoundMention[] = []
  messages.forEach((message, index) => {
    const writing =
      message.state === 'running' ||
      (isWorking && index === messages.length - 1 && message.role !== 'user')
    if (writing || message.timestamp === null || message.timestamp < since) {
      return
    }
    const signature = messageSignature(message)
    let cached = cache.get(message.id)
    if (cached?.signature !== signature) {
      cached = { signature, mentions: findPaperMentionsInMessage(message) }
      cache.set(message.id, cached)
    }
    for (const mention of cached.mentions) {
      found.push({ mention, messageId: message.id })
    }
  })
  return found
}

/** Keys this window is looking up now, or failed to look up this session (not retried). */
const busyKeys = new Set<string>()

function originFor(
  context: ChatPaperContext,
  candidate: ChatPaperCandidate,
  addedBy: LibraryPaperOrigin['addedBy']
): LibraryPaperOrigin {
  const request = candidate.request
  const fromElsewhere = request !== undefined && request.sessionId !== context.chatKey
  return {
    kind: fromElsewhere ? 'agent' : 'chat',
    ...(fromElsewhere ? {} : { sessionId: context.chatKey }),
    ...(!fromElsewhere && candidate.messageId
      ? { messageId: candidate.messageId.slice(0, 512) }
      : {}),
    ...(!fromElsewhere && context.chatTitle ? { chatTitle: context.chatTitle.slice(0, 200) } : {}),
    addedBy,
    ...(request?.agent ? { agent: request.agent.slice(0, 64) } : {}),
    ...(request?.note ? { note: request.note.slice(0, 500) } : {})
  }
}

/** Adds the candidates and records the outcome; the notice offers Undo when the setting added them. */
export async function addChatPapers(
  context: ChatPaperContext,
  candidates: readonly ChatPaperCandidate[],
  addedBy: LibraryPaperOrigin['addedBy']
): Promise<void> {
  if (!candidates.length) {
    return
  }
  const { papers, pdfFailure } = await addLibraryDrafts(
    context.scope,
    candidates.map((candidate) => ({
      draft: candidate.draft,
      origin: originFor(context, candidate, addedBy)
    }))
  )
  const now = Date.now()
  const entries: Record<string, ChatPaperEntry> = {}
  for (const candidate of candidates) {
    const paper = papers.find(
      (entry) => entry.title === candidate.draft.title && entry.arxivId === candidate.draft.arxivId
    )
    entries[candidate.key] = paper
      ? { state: 'added', at: now, paperIds: [paper.id] }
      : { state: 'present', at: now }
  }
  setChatPaperEntries(context.chatKey, entries, now)
  if (addedBy === 'auto' && papers.length) {
    showChatPaperNotice(context.chatKey, {
      paperIds: papers.map((paper) => paper.id),
      titles: papers.map((paper) => paper.title),
      keys: candidates.map((candidate) => candidate.key)
    })
  }
  if (pdfFailure) {
    toast.warning('Paper added without its PDF', { description: pdfFailure })
  }
}

export function dismissChatPapers(chatKey: string, keys: readonly string[]): void {
  const now = Date.now()
  setChatPaperEntries(
    chatKey,
    Object.fromEntries(keys.map((key) => [key, { state: 'dismissed' as const, at: now }])),
    now
  )
}

export async function undoChatPaperNotice(chatKey: string, notice: ChatPaperNotice): Promise<void> {
  await removeLibraryPapers(notice.paperIds)
  dismissChatPapers(chatKey, notice.keys)
  showChatPaperNotice(chatKey, null)
}

/**
 * Looks each new mention up once: a paper the Library holds is noted, an unsure citation is
 * skipped, and the rest wait for the person (Ask) or go straight in (Add automatically).
 */
export async function processChatMentions(
  context: ChatPaperContext,
  found: readonly FoundMention[],
  mode: ChatPaperMode
): Promise<void> {
  const known = useChatPapers.getState().chats[context.chatKey]?.papers ?? {}
  const fresh = found.filter(({ mention }) => {
    const busy = `${context.chatKey}|${mention.key}`
    return !known[mention.key] && !busyKeys.has(busy)
  })
  const unique = [...new Map(fresh.map((item) => [item.mention.key, item])).values()]
  unique.forEach(({ mention }) => busyKeys.add(`${context.chatKey}|${mention.key}`))
  const settled: Record<string, ChatPaperEntry> = {}
  const candidates: ChatPaperCandidate[] = []
  for (const { mention, messageId, request } of unique) {
    const papers = useResearchLibrary.getState().document?.papers ?? []
    const now = Date.now()
    const identity = { ...mention, title: mention.slug ? undefined : mention.title }
    if (findLibraryPaperMatch(papers, context.scope, identity)) {
      settled[mention.key] = { state: 'present', at: now }
      continue
    }
    try {
      const resolution = await resolvePaperMention(mention)
      if (resolution.kind === 'none') {
        settled[mention.key] = { state: 'skipped', at: now }
      } else if (findLibraryPaperMatch(papers, context.scope, resolution.draft)) {
        settled[mention.key] = { state: 'present', at: now }
      } else {
        candidates.push({
          key: mention.key,
          draft: resolution.draft,
          messageId,
          ...(request ? { request } : {})
        })
      }
    } catch {
      // Offline or rate limited: this window leaves it for the next session.
      continue
    }
    busyKeys.delete(`${context.chatKey}|${mention.key}`)
  }
  for (const key of Object.keys(settled)) {
    busyKeys.delete(`${context.chatKey}|${key}`)
  }
  setChatPaperEntries(context.chatKey, settled)
  // Why: Off mutes passive detection only; an agent's explicit request still reaches the person.
  if (mode === 'auto') {
    await addChatPapers(context, candidates, 'auto').catch((cause: unknown) => {
      toast.error('Papers from the chat were not added', { description: String(cause) })
    })
    return
  }
  const now = Date.now()
  setChatPaperEntries(
    context.chatKey,
    Object.fromEntries(
      candidates.map((candidate) => [
        candidate.key,
        { state: 'pending' as const, at: now, candidate }
      ])
    ),
    now
  )
}

/** The project's `library add` requests this chat should show: its own agent's, or any agent's
 *  that ran outside a chat. A request counts as handled once its paper has an outcome here. */
export async function readChatLibraryRequests(
  scope: LibraryScope,
  chatKey: string
): Promise<FoundMention[]> {
  let requests: LibraryRequest[] = []
  for (const relative of LIBRARY_REQUEST_PATHS) {
    const path = resolveRuntimePath(scope.workspacePath, relative)
    if (await researchFileExists(scope, path)) {
      requests = parseLibraryRequests(await readResearchTextFile(scope, path, 2 * 1024 * 1024))
      break
    }
  }
  const handled = useChatPapers.getState().requests
  const found: FoundMention[] = []
  const unreadable: string[] = []
  for (const request of requests) {
    const sessionId = request.agent?.sessionId ?? null
    if (handled[request.id] !== undefined || (sessionId !== null && sessionId !== chatKey)) {
      continue
    }
    const mention = mentionFromLibraryRequest(request)
    if (!mention) {
      unreadable.push(request.id)
      continue
    }
    found.push({
      mention,
      messageId: null,
      request: {
        id: request.id,
        agent: request.agent?.provider ?? null,
        note: request.note ?? null,
        sessionId
      }
    })
  }
  markLibraryRequestsHandled(unreadable)
  return found
}

/** Requests whose paper now has an outcome in this chat are not read again. */
export function settleChatLibraryRequests(chatKey: string, found: readonly FoundMention[]): void {
  const papers = useChatPapers.getState().chats[chatKey]?.papers ?? {}
  markLibraryRequestsHandled(
    found.flatMap((item) => (item.request && papers[item.mention.key] ? [item.request.id] : []))
  )
}
