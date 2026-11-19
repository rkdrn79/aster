import { describe, expect, it } from 'vitest'
import { mentionFromLibraryRequest, parseLibraryRequests } from './research-library-requests'

describe('library requests', () => {
  it('reads the harness lines and skips torn or foreign ones', () => {
    const requests = parseLibraryRequests(
      [
        JSON.stringify({
          v: 1,
          id: 'lr-abc',
          createdAt: 'x',
          arxivId: '1706.03762v7',
          agent: { provider: 'codex', sessionId: 's1', paneKey: null }
        }),
        '{"v":1,"id":"lr-torn"',
        JSON.stringify({ v: 2, id: 'lr-new', createdAt: 'x' }),
        JSON.stringify({ v: 1, id: 'lr-def', createdAt: 'y', title: 'A Survey of Things', year: 1 })
      ].join('\n')
    )
    expect(requests.map((request) => request.id)).toEqual(['lr-abc', 'lr-def'])
    expect(requests[0].agent).toEqual({ provider: 'codex', sessionId: 's1' })
    expect(requests[1].year).toBeUndefined()
    expect(mentionFromLibraryRequest(requests[0])?.key).toBe('arxiv:1706.03762')
    expect(mentionFromLibraryRequest(requests[1])).toMatchObject({
      key: 'title:a survey of things',
      trusted: true
    })
  })
})
