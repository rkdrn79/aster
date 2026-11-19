// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NativeChatMessage } from '../../../../shared/native-chat-types'
import {
  emptyResearchLibraryDocument,
  type ArxivPaperMetadata,
  type LibraryScope,
  type ResearchLibraryDocument
} from '../../../../shared/research/research-library'
import {
  addChatPapers,
  collectChatMentions,
  processChatMentions,
  readChatLibraryRequests,
  settleChatLibraryRequests,
  undoChatPaperNotice,
  type ChatPaperContext
} from './research-chat-papers-actions'
import { pendingChatPapers, useChatPapers } from './research-chat-papers-store'

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  read: vi.fn(),
  download: vi.fn(),
  getState: vi.fn()
}))

vi.mock('sonner', () => ({ toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } }))
vi.mock('./research-file-reader', () => ({
  researchFileExists: mocks.exists,
  readResearchTextFile: mocks.read
}))
vi.mock('./research-library-pdf-download', () => ({
  canDownloadLibraryPdf: () => true,
  downloadLibraryArxivPdf: mocks.download
}))
vi.mock('./research-library-store', () => ({
  useResearchLibrary: { getState: mocks.getState }
}))

const scope: LibraryScope = { hostId: 'local', workspaceId: 'w1', workspacePath: '/p' }
const context: ChatPaperContext = { scope, chatKey: 'session-1', chatTitle: 'Baselines' }
let document: ResearchLibraryDocument

function arxiv(arxivId: string, title: string): ArxivPaperMetadata {
  return {
    arxivId,
    title,
    authors: ['Ashish Vaswani', 'Noam Shazeer'],
    abstract: 'Abstract.',
    published: '2017-06-12',
    year: 2017,
    primaryCategory: 'cs.CL',
    doi: null,
    journalRef: null,
    absUrl: `https://arxiv.org/abs/${arxivId}`,
    pdfUrl: `https://arxiv.org/pdf/${arxivId}`
  }
}

const lookupArxiv = vi.fn()
const searchTitle = vi.fn()

function message(id: string, text: string, timestamp = Date.now()): NativeChatMessage {
  return {
    id,
    role: 'assistant',
    blocks: [{ type: 'text', text }],
    timestamp,
    source: 'transcript'
  }
}

beforeEach(() => {
  window.localStorage.clear()
  useChatPapers.setState({ v: 1, chats: {}, requests: {}, notices: {} })
  document = emptyResearchLibraryDocument()
  mocks.exists.mockReset().mockResolvedValue(true)
  mocks.read.mockReset()
  mocks.download.mockReset().mockResolvedValue({ relativePath: '.aster/library/papers/x.pdf' })
  mocks.getState.mockReset().mockImplementation(() => ({
    document,
    update: async (change: (current: ResearchLibraryDocument) => ResearchLibraryDocument) => {
      document = change(document)
    }
  }))
  lookupArxiv
    .mockReset()
    .mockImplementation(async ({ reference }: { reference: string }) =>
      arxiv(
        reference,
        reference === '1706.03762' ? 'Attention Is All You Need' : `Paper ${reference}`
      )
    )
  searchTitle.mockReset().mockResolvedValue(null)
  Object.assign(window, { api: { researchLibrary: { lookupArxiv, searchTitle } } })
})

describe('chat papers', () => {
  it('reads only messages written since the chat was first watched, and waits for a live reply', () => {
    const since = 1000
    const found = collectChatMentions(
      [
        message('old', 'arXiv:1111.11111', 10),
        message('done', 'arXiv:1706.03762', 2000),
        message('live', 'arXiv:2410.12345', 3000)
      ],
      since,
      true,
      new Map()
    )
    expect(found.map((item) => [item.messageId, item.mention.key])).toEqual([
      ['done', 'arxiv:1706.03762']
    ])
  })

  it('asks once per paper, skips Library papers and unsure citations, and records where it came from', async () => {
    document.papers.push({
      id: '00000000-0000-4000-8000-000000000001',
      scope,
      title: 'Deep Residual Learning',
      arxivId: '1512.03385',
      tags: [],
      status: 'unread',
      createdAt: 'x',
      updatedAt: 'x'
    })
    const found = collectChatMentions(
      [
        message(
          'm1',
          'See https://arxiv.org/abs/1706.03762 and arXiv:1512.03385, and "Some Unfindable Paper Title" (Nobody et al., 2020).'
        )
      ],
      0,
      false,
      new Map()
    )
    await processChatMentions(context, found, 'ask')
    await processChatMentions(context, found, 'ask')
    expect(lookupArxiv).toHaveBeenCalledTimes(1)
    expect(searchTitle).toHaveBeenCalledTimes(1)
    const chat = useChatPapers.getState().chats['session-1']
    expect(chat.papers['arxiv:1512.03385'].state).toBe('present')
    expect(chat.papers['title:some unfindable paper title'].state).toBe('skipped')
    const pending = pendingChatPapers(chat)
    expect(pending.map((candidate) => candidate.draft.title)).toEqual(['Attention Is All You Need'])

    await addChatPapers(context, pending, 'person')
    const added = document.papers.at(-1)
    expect(added).toMatchObject({
      title: 'Attention Is All You Need',
      arxivId: '1706.03762',
      pdfPath: '.aster/library/papers/x.pdf',
      origin: {
        kind: 'chat',
        sessionId: 'session-1',
        messageId: 'm1',
        chatTitle: 'Baselines',
        addedBy: 'person'
      }
    })
    expect(useChatPapers.getState().chats['session-1'].papers['arxiv:1706.03762'].state).toBe(
      'added'
    )
  })

  it('adds straight in when the setting says so, and Undo takes the papers back out', async () => {
    const found = collectChatMentions(
      [message('m1', 'arXiv:1706.03762 and arXiv:2410.12345')],
      0,
      false,
      new Map()
    )
    await processChatMentions(context, found, 'auto')
    expect(document.papers.map((paper) => paper.origin?.addedBy)).toEqual(['auto', 'auto'])
    const notice = useChatPapers.getState().notices['session-1']
    expect(notice?.paperIds).toHaveLength(2)
    await undoChatPaperNotice('session-1', notice!)
    expect(document.papers).toEqual([])
    expect(useChatPapers.getState().chats['session-1'].papers['arxiv:2410.12345'].state).toBe(
      'dismissed'
    )
    expect(useChatPapers.getState().notices['session-1']).toBeUndefined()
  })

  it('takes this chat’s agent requests and ones from outside any chat, once', async () => {
    mocks.read.mockResolvedValue(
      [
        {
          v: 1,
          id: 'lr-1',
          createdAt: 'x',
          arxivId: '1706.03762',
          note: 'closest prior method',
          agent: { provider: 'codex', sessionId: 'session-1' }
        },
        {
          v: 1,
          id: 'lr-2',
          createdAt: 'x',
          arxivId: '2410.12345',
          agent: { provider: 'claude-code', sessionId: 'other-chat' }
        },
        { v: 1, id: 'lr-3', createdAt: 'x', title: 'A Paper Named By Hand', year: 2024 }
      ]
        .map((line) => JSON.stringify(line))
        .join('\n')
    )
    const found = await readChatLibraryRequests(scope, 'session-1')
    expect(found.map((item) => item.request?.id)).toEqual(['lr-1', 'lr-3'])
    await processChatMentions(context, found, 'ask')
    settleChatLibraryRequests('session-1', found)
    expect(await readChatLibraryRequests(scope, 'session-1')).toEqual([])
    const pending = pendingChatPapers(useChatPapers.getState().chats['session-1'])
    expect(pending.map((candidate) => candidate.draft.title)).toEqual([
      'Attention Is All You Need',
      'A Paper Named By Hand'
    ])
    await addChatPapers(context, pending, 'person')
    expect(document.papers[0].origin).toMatchObject({
      kind: 'chat',
      agent: 'codex',
      note: 'closest prior method'
    })
    expect(document.papers[1].origin).toMatchObject({ kind: 'agent', addedBy: 'person' })
    expect(document.papers[1].origin?.sessionId).toBeUndefined()
  })
})
