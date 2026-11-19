import { describe, expect, it } from 'vitest'
import type { LibraryPaper } from './research-library'
import {
  citedSurnames,
  findLibraryPaperMatch,
  isConfidentTitleMatch,
  normalizePaperTitle
} from './research-library-paper-match'

const scope = { hostId: 'local', workspaceId: 'w1', workspacePath: '/p' }

function paper(fields: Partial<LibraryPaper>): LibraryPaper {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    scope,
    title: 'Untitled',
    tags: [],
    status: 'unread',
    createdAt: 'x',
    updatedAt: 'x',
    ...fields
  }
}

describe('library paper matching', () => {
  it('normalises titles for comparison', () => {
    expect(normalizePaperTitle('BERT: Pre-training of {Deep} Bidirectional Transformers')).toBe(
      'bert pre training of deep bidirectional transformers'
    )
    expect(normalizePaperTitle('Échantillonnage \\emph{rapide}')).toBe('echantillonnage rapide')
  })

  it('finds the same work by arXiv ID, DOI or title, in this project only', () => {
    const papers = [
      paper({ arxivId: '1706.03762v5' }),
      paper({ id: '00000000-0000-4000-8000-000000000002', doi: '10.1145/ABC' }),
      paper({ id: '00000000-0000-4000-8000-000000000003', title: 'Deep Residual Learning' }),
      paper({
        id: '00000000-0000-4000-8000-000000000004',
        scope: { ...scope, workspaceId: 'other' },
        arxivId: '2410.12345'
      })
    ]
    expect(findLibraryPaperMatch(papers, scope, { arxivId: '1706.03762' })?.arxivId).toBe(
      '1706.03762v5'
    )
    expect(findLibraryPaperMatch(papers, scope, { doi: '10.1145/abc' })?.doi).toBe('10.1145/ABC')
    expect(findLibraryPaperMatch(papers, scope, { title: 'Deep residual learning.' })).toBeDefined()
    expect(findLibraryPaperMatch(papers, scope, { arxivId: '2410.12345' })).toBeUndefined()
    expect(findLibraryPaperMatch(papers, scope, { title: '' })).toBeUndefined()
  })

  it('reads family names from citation styles', () => {
    expect(citedSurnames('Vaswani et al.')).toEqual(['vaswani'])
    expect(citedSurnames('Kingma, D. P., & Ba, J.')).toEqual(['kingma', 'ba'])
    expect(citedSurnames('Ashish Vaswani and Noam Shazeer')).toEqual(['vaswani', 'shazeer'])
  })

  it('confirms a title only when the year and first author agree', () => {
    const found = {
      title: 'Attention Is All You Need',
      year: 2017,
      authors: ['Ashish Vaswani', 'Noam Shazeer']
    }
    expect(isConfidentTitleMatch({ title: 'Attention is all you need', year: 2017 }, found)).toBe(
      true
    )
    expect(
      isConfidentTitleMatch(
        { title: 'Attention is all you need', authors: 'Vaswani et al.' },
        found
      )
    ).toBe(true)
    expect(isConfidentTitleMatch({ title: 'Attention is all you need', year: 2021 }, found)).toBe(
      false
    )
    expect(
      isConfidentTitleMatch({ title: 'Attention is all you need', authors: 'Smith et al.' }, found)
    ).toBe(false)
    expect(isConfidentTitleMatch({ title: 'Attention is not all you need' }, found)).toBe(false)
    expect(
      isConfidentTitleMatch(
        { title: 'attention is all you need vaswani shazeer', slug: true },
        found
      )
    ).toBe(true)
    expect(
      isConfidentTitleMatch(
        { title: 'attention is all you need for vision', slug: true },
        {
          ...found,
          title: 'Attention'
        }
      )
    ).toBe(false)
  })
})
