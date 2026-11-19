import { describe, expect, it, vi } from 'vitest'
import { searchPaperByTitle, type LibrarySearchFetch } from './research-library-search'

function atom(entries: { id: string; title: string; year: number; authors: string[] }[]): string {
  return `<feed>${entries
    .map(
      (entry) => `<entry><id>http://arxiv.org/abs/${entry.id}</id><title>${entry.title}</title>
<published>${entry.year}-06-12T00:00:00Z</published><summary>Abstract.</summary>
${entry.authors.map((name) => `<author><name>${name}</name></author>`).join('')}</entry>`
    )
    .join('')}</feed>`
}

function stubFetch(replies: Record<string, string>): LibrarySearchFetch & { urls: string[] } {
  const urls: string[] = []
  const fetchUrl = vi.fn(async (url: string) => {
    urls.push(url)
    const host = new URL(url).hostname
    return new Response(replies[host] ?? '', { status: replies[host] === undefined ? 500 : 200 })
  })
  return Object.assign(fetchUrl, { urls })
}

describe('searchPaperByTitle', () => {
  it('takes the confident arXiv match and never asks Crossref', async () => {
    const fetchUrl = stubFetch({
      'export.arxiv.org': atom([
        {
          id: '2101.00001v1',
          title: 'Attention Is All You Need for Vision',
          year: 2021,
          authors: ['A. B']
        },
        {
          id: '1706.03762v7',
          title: 'Attention Is All You Need',
          year: 2017,
          authors: ['Ashish Vaswani']
        }
      ])
    })
    const result = await searchPaperByTitle(
      { title: 'Attention is all you need', year: 2017, authors: 'Vaswani et al.' },
      fetchUrl
    )
    expect(result).toMatchObject({ source: 'arxiv', paper: { arxivId: '1706.03762v7' } })
    expect(fetchUrl.urls).toHaveLength(1)
    expect(decodeURIComponent(fetchUrl.urls[0])).toContain('ti:"attention is all you need"')
  })

  it('falls back to Crossref, and returns nothing when no match is confident', async () => {
    const crossref = JSON.stringify({
      message: {
        items: [
          {
            DOI: '10.1109/CVPR.2016.90',
            title: ['Deep Residual Learning for Image Recognition'],
            author: [{ given: 'Kaiming', family: 'He' }],
            issued: { 'date-parts': [[2016, 6]] },
            'container-title': ['CVPR']
          }
        ]
      }
    })
    const fetchUrl = stubFetch({
      'export.arxiv.org': '<feed></feed>',
      'api.crossref.org': crossref
    })
    await expect(
      searchPaperByTitle(
        { title: 'Deep Residual Learning for Image Recognition', authors: 'He et al.', year: 2016 },
        fetchUrl
      )
    ).resolves.toMatchObject({ source: 'crossref', paper: { doi: '10.1109/CVPR.2016.90' } })
    await expect(
      searchPaperByTitle(
        { title: 'Deep Residual Learning for Image Recognition', year: 2010 },
        fetchUrl
      )
    ).resolves.toBeNull()
  })

  it('drops the author names a Semantic Scholar slug ends with', async () => {
    const fetchUrl = stubFetch({
      'export.arxiv.org': atom([
        {
          id: '1706.03762',
          title: 'Attention Is All You Need',
          year: 2017,
          authors: ['A. Vaswani']
        }
      ])
    })
    const result = await searchPaperByTitle(
      { title: 'Attention is All you Need Vaswani Shazeer', slug: true },
      fetchUrl
    )
    expect(result?.source).toBe('arxiv')
    expect(decodeURIComponent(fetchUrl.urls[0])).toContain('ti:"attention is all you need"')
  })

  it('reports a failed lookup instead of calling it no match', async () => {
    await expect(
      searchPaperByTitle({ title: 'Attention is all you need' }, stubFetch({}))
    ).rejects.toThrow('HTTP 500')
  })
})
