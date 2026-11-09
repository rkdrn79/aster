import { describe, expect, it, vi } from 'vitest'
import { fetchOpenReviewForum } from './research-openreview-ipc'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() }, net: { fetch: vi.fn() } }))

const review = {
  id: 'rev1',
  forum: 'OldForum1',
  invitation: 'Venue/2022/Paper1/-/Official_Review',
  signatures: ['Venue/2022/Paper1/Reviewer_k3Lm'],
  content: { main_review: 'Needs baselines.' }
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('fetchOpenReviewForum', () => {
  it('falls back to API v1 when API v2 has no such forum', async () => {
    const fetchUrl = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(reply({ notes: [] }))
      .mockResolvedValueOnce(reply({ notes: [review] }))
    const forum = await fetchOpenReviewForum(fetchUrl, 'https://openreview.net/forum?id=OldForum1')
    expect(fetchUrl.mock.calls.map(([url]) => url)).toEqual([
      'https://api2.openreview.net/notes?forum=OldForum1',
      'https://api.openreview.net/notes?forum=OldForum1'
    ])
    expect(forum.reviews.map((entry) => entry.label)).toEqual(['Reviewer k3Lm'])
  })

  it('refuses a link that is not an OpenReview forum and reports rate limits', async () => {
    const fetchUrl = vi.fn(async () => reply({ notes: [] }, 429))
    await expect(fetchOpenReviewForum(fetchUrl, 'https://example.com/x')).rejects.toThrow(
      /forum link/
    )
    expect(fetchUrl).not.toHaveBeenCalled()
    await expect(fetchOpenReviewForum(fetchUrl, 'Ab12Cd34')).rejects.toThrow(/limiting requests/)
  })

  it('returns an empty forum when no review is public', async () => {
    const forum = await fetchOpenReviewForum(async () => reply({ notes: [] }), 'Ab12Cd34')
    expect(forum).toEqual({ forum: 'Ab12Cd34', title: null, venue: null, reviews: [] })
  })
})
